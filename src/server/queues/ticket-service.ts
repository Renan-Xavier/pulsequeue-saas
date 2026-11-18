import crypto from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { organizations, queues, tickets } from "@/db/schema";
import { recordAuditLog } from "@/lib/tenant-auth";
import { publishOrganizationEvent } from "@/server/realtime/bus";
import { enqueueAndDispatchOutbox } from "@/server/webhooks/outbox";
import {
  calculateSlaDeadline,
  canTransitionTicketStatus,
  compareQueueTickets,
  formatTicketCode,
  type TicketPriority,
  type TicketStatus,
} from "./sla";

export interface CreateTicketParams {
  organizationId: string;
  queueId: string;
  customerName: string;
  customerContact?: string;
  subject: string;
  priority: TicketPriority;
  actorUserId?: string | null;
  actorEmail?: string;
}

/**
 * Atomically allocates the next queue sequence code, computes SLA deadline,
 * persists the ticket, writes an audit trail, emits SSE, and queues an outbox event.
 */
export async function createTicketInQueue(params: CreateTicketParams) {
  const db = getDb();

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, params.organizationId))
    .limit(1);

  if (!org) {
    throw new Error("Organização não encontrada.");
  }

  const [updatedQueue] = await db
    .update(queues)
    .set({
      nextSequence: sql`${queues.nextSequence} + 1`,
    })
    .where(
      and(
        eq(queues.id, params.queueId),
        eq(queues.organizationId, params.organizationId)
      )
    )
    .returning();

  if (!updatedQueue) {
    throw new Error("Fila não encontrada para esta organização.");
  }

  const assignedSequence = updatedQueue.nextSequence - 1;
  const ticketCode = formatTicketCode(updatedQueue.prefix, assignedSequence);
  const now = new Date();
  const slaDeadlineAt = calculateSlaDeadline(
    now,
    org.slaTargetMinutes,
    params.priority
  );

  const ticketId = `tkt_${crypto.randomUUID()}`;
  const [created] = await db
    .insert(tickets)
    .values({
      id: ticketId,
      organizationId: params.organizationId,
      queueId: params.queueId,
      ticketCode,
      customerName: params.customerName.trim(),
      customerContact: (params.customerContact ?? "").trim(),
      subject: params.subject.trim(),
      priority: params.priority,
      status: "WAITING",
      slaDeadlineAt,
      createdAt: now,
    })
    .returning();

  await recordAuditLog({
    organizationId: params.organizationId,
    actorUserId: params.actorUserId ?? null,
    actorEmail: params.actorEmail ?? "portal@pulsequeue.dev",
    action: "TICKET_CREATED",
    entityType: "ticket",
    entityId: created.id,
    metadata: {
      ticketCode: created.ticketCode,
      priority: created.priority,
      queueName: updatedQueue.name,
    },
  });

  publishOrganizationEvent({
    type: "ticket.created",
    organizationId: params.organizationId,
    timestamp: new Date().toISOString(),
    summary: `Nova senha ${created.ticketCode} (${created.priority}) — ${created.customerName}`,
    entityId: created.id,
  });

  await enqueueAndDispatchOutbox({
    organizationId: params.organizationId,
    eventType: "ticket.created",
    idempotencyKey: `ticket-created:${created.id}`,
    payload: {
      ticketId: created.id,
      ticketCode: created.ticketCode,
      customerName: created.customerName,
      subject: created.subject,
      priority: created.priority,
      status: created.status,
      slaDeadlineAt: created.slaDeadlineAt.toISOString(),
    },
  });

  return created;
}

/**
 * Transitions a ticket across the SLA queue state machine and triggers real-time SSE + webhook events.
 */
export async function transitionTicketStatus(params: {
  organizationId: string;
  ticketId: string;
  nextStatus: TicketStatus;
  deskLabel?: string;
  actorUserId: string;
  actorEmail: string;
}) {
  const db = getDb();

  const [existing] = await db
    .select()
    .from(tickets)
    .where(
      and(
        eq(tickets.id, params.ticketId),
        eq(tickets.organizationId, params.organizationId)
      )
    )
    .limit(1);

  if (!existing) {
    throw new Error("TICKET_NOT_FOUND");
  }

  const currentStatus = existing.status as TicketStatus;
  if (!canTransitionTicketStatus(currentStatus, params.nextStatus)) {
    throw new Error(
      `INVALID_TRANSITION:${currentStatus}->${params.nextStatus}`
    );
  }

  const now = new Date();
  const [updated] = await db
    .update(tickets)
    .set({
      status: params.nextStatus,
      deskLabel:
        params.nextStatus === "IN_PROGRESS"
          ? params.deskLabel?.trim() || existing.deskLabel || "Guichê 01"
          : existing.deskLabel,
      assignedUserId:
        params.nextStatus === "IN_PROGRESS"
          ? params.actorUserId
          : existing.assignedUserId,
      startedAt:
        params.nextStatus === "IN_PROGRESS"
          ? existing.startedAt ?? now
          : existing.startedAt,
      completedAt:
        params.nextStatus === "COMPLETED" || params.nextStatus === "CANCELLED"
          ? now
          : null,
    })
    .where(
      and(
        eq(tickets.id, existing.id),
        eq(tickets.organizationId, params.organizationId)
      )
    )
    .returning();

  const eventType =
    params.nextStatus === "IN_PROGRESS"
      ? "ticket.called"
      : params.nextStatus === "COMPLETED"
        ? "ticket.completed"
        : "ticket.cancelled";

  await recordAuditLog({
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    actorEmail: params.actorEmail,
    action: `TICKET_${params.nextStatus}`,
    entityType: "ticket",
    entityId: updated.id,
    metadata: {
      ticketCode: updated.ticketCode,
      from: currentStatus,
      to: params.nextStatus,
      deskLabel: updated.deskLabel,
    },
  });

  publishOrganizationEvent({
    type:
      params.nextStatus === "IN_PROGRESS"
        ? "ticket.called"
        : "ticket.updated",
    organizationId: params.organizationId,
    timestamp: new Date().toISOString(),
    summary:
      params.nextStatus === "IN_PROGRESS"
        ? `Senha ${updated.ticketCode} chamada no ${updated.deskLabel}`
        : `Senha ${updated.ticketCode} atualizada para ${params.nextStatus}`,
    entityId: updated.id,
  });

  await enqueueAndDispatchOutbox({
    organizationId: params.organizationId,
    eventType,
    idempotencyKey: `${eventType}:${updated.id}:${updated.status}:${now.getTime()}`,
    payload: {
      ticketId: updated.id,
      ticketCode: updated.ticketCode,
      customerName: updated.customerName,
      deskLabel: updated.deskLabel,
      status: updated.status,
    },
  });

  return updated;
}

/**
 * Selects the highest-priority WAITING ticket in the organization (optionally scoped to one queue)
 * using priority weight + earliest SLA deadline, and transitions it to IN_PROGRESS.
 */
export async function callNextWaitingTicket(params: {
  organizationId: string;
  queueId?: string;
  deskLabel: string;
  actorUserId: string;
  actorEmail: string;
}) {
  const db = getDb();

  const filters = [
    eq(tickets.organizationId, params.organizationId),
    eq(tickets.status, "WAITING"),
  ];
  if (params.queueId) {
    filters.push(eq(tickets.queueId, params.queueId));
  }

  const waitingTickets = await db
    .select()
    .from(tickets)
    .where(and(...filters))
    .orderBy(asc(tickets.createdAt));

  if (waitingTickets.length === 0) {
    return null;
  }

  const sorted = [...waitingTickets].sort((a, b) =>
    compareQueueTickets(
      {
        priority: a.priority as TicketPriority,
        slaDeadlineAt: a.slaDeadlineAt,
        createdAt: a.createdAt,
      },
      {
        priority: b.priority as TicketPriority,
        slaDeadlineAt: b.slaDeadlineAt,
        createdAt: b.createdAt,
      }
    )
  );

  const chosen = sorted[0];
  return transitionTicketStatus({
    organizationId: params.organizationId,
    ticketId: chosen.id,
    nextStatus: "IN_PROGRESS",
    deskLabel: params.deskLabel,
    actorUserId: params.actorUserId,
    actorEmail: params.actorEmail,
  });
}
