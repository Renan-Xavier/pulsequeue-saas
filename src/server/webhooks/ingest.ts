import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { organizations, queues, webhookDeliveries } from "@/db/schema";
import { recordAuditLog } from "@/lib/tenant-auth";
import { createTicketInQueue } from "@/server/queues/ticket-service";
import { publishOrganizationEvent } from "@/server/realtime/bus";
import { verifyWebhookSignature } from "./hmac";

const inboundPayloadSchema = z.object({
  event: z.enum(["ticket.inbound", "ticket.created"]).default("ticket.inbound"),
  customerName: z.string().min(2).max(120),
  customerContact: z.string().max(120).optional(),
  subject: z.string().min(3).max(200),
  priority: z.enum(["URGENT", "HIGH", "NORMAL"]).default("NORMAL"),
  queuePrefix: z.string().max(8).optional(),
});

export interface IngestWebhookResult {
  httpStatus: number;
  body: Record<string, unknown>;
}

/**
 * Verifies inbound HMAC-SHA256 webhook signature, enforces idempotency per tenant,
 * and opens a queue ticket cleanly when not already processed.
 */
export async function ingestSignedWebhook(params: {
  orgSlug: string;
  rawBody: string;
  signatureHeader: string | null;
  idempotencyKey: string | null;
  targetUrl: string;
}): Promise<IngestWebhookResult> {
  const db = getDb();

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, params.orgSlug))
    .limit(1);

  if (!org) {
    return {
      httpStatus: 404,
      body: { error: "Organização não encontrada para ingestão de webhook." },
    };
  }

  let parsedJson: Record<string, unknown> = {};
  try {
    parsedJson = JSON.parse(params.rawBody || "{}");
  } catch {
    return {
      httpStatus: 400,
      body: { error: "Payload JSON inválido." },
    };
  }

  const verification = verifyWebhookSignature({
    rawBody: params.rawBody,
    headerValue: params.signatureHeader,
    secret: org.webhookSecret,
  });

  const safeIdempotencyKey =
    params.idempotencyKey?.trim() || `no-key-${crypto.randomUUID()}`;

  if (!verification.valid) {
    await db
      .insert(webhookDeliveries)
      .values({
        id: `del_${crypto.randomUUID()}`,
        organizationId: org.id,
        direction: "INBOUND",
        eventType: String(parsedJson.event || "unknown"),
        targetUrl: params.targetUrl,
        idempotencyKey: `rejected:${Date.now()}:${crypto.randomBytes(3).toString("hex")}`,
        signatureHeader: params.signatureHeader || "missing",
        httpStatus: 401,
        status: "REJECTED",
        responseSummary: `Assinatura inválida: ${verification.reason}`,
        payload: parsedJson,
      })
      .catch(() => null);

    await recordAuditLog({
      organizationId: org.id,
      action: "WEBHOOK_SIGNATURE_REJECTED",
      entityType: "webhook",
      entityId: org.id,
      metadata: {
        reason: verification.reason,
        idempotencyKey: safeIdempotencyKey,
      },
    });

    return {
      httpStatus: 401,
      body: {
        error: "Assinatura HMAC-SHA256 inválida ou expirada.",
        reason: verification.reason,
      },
    };
  }

  if (!params.idempotencyKey?.trim()) {
    return {
      httpStatus: 400,
      body: { error: "Header Idempotency-Key obrigatório para ingestão segura." },
    };
  }

  const existing = await db
    .select()
    .from(webhookDeliveries)
    .where(
      and(
        eq(webhookDeliveries.organizationId, org.id),
        eq(webhookDeliveries.direction, "INBOUND"),
        eq(webhookDeliveries.idempotencyKey, safeIdempotencyKey)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    publishOrganizationEvent({
      type: "webhook.processed",
      organizationId: org.id,
      timestamp: new Date().toISOString(),
      summary: `Webhook duplicado bloqueado por Idempotency-Key (${safeIdempotencyKey})`,
      entityId: existing[0].id,
    });

    return {
      httpStatus: 200,
      body: {
        ok: true,
        deduplicated: true,
        idempotencyKey: safeIdempotencyKey,
        message: "Evento já processado anteriormente — nenhum ticket duplicado foi criado.",
        originalPayload: existing[0].payload,
      },
    };
  }

  const validation = inboundPayloadSchema.safeParse(parsedJson);
  if (!validation.success) {
    return {
      httpStatus: 422,
      body: {
        error: "Dados do webhook inválidos.",
        issues: validation.error.issues,
      },
    };
  }

  const orgQueues = await db
    .select()
    .from(queues)
    .where(and(eq(queues.organizationId, org.id), eq(queues.isActive, true)));

  if (orgQueues.length === 0) {
    return {
      httpStatus: 400,
      body: { error: "Organização não possui filas ativas." },
    };
  }

  const targetQueue =
    orgQueues.find(
      (q) =>
        validation.data.queuePrefix &&
        q.prefix.toUpperCase() === validation.data.queuePrefix.toUpperCase()
    ) ?? orgQueues[0];

  const ticket = await createTicketInQueue({
    organizationId: org.id,
    queueId: targetQueue.id,
    customerName: validation.data.customerName,
    customerContact: validation.data.customerContact,
    subject: validation.data.subject,
    priority: validation.data.priority,
    actorEmail: "webhook-ingest@pulsequeue.dev",
  });

  await db.insert(webhookDeliveries).values({
    id: `del_${crypto.randomUUID()}`,
    organizationId: org.id,
    direction: "INBOUND",
    eventType: validation.data.event,
    targetUrl: params.targetUrl,
    idempotencyKey: safeIdempotencyKey,
    signatureHeader: params.signatureHeader || "",
    httpStatus: 201,
    status: "DELIVERED",
    responseSummary: `Ticket ${ticket.ticketCode} criado via Webhook HMAC`,
    payload: {
      ...parsedJson,
      createdTicketCode: ticket.ticketCode,
      createdTicketId: ticket.id,
    },
  });

  return {
    httpStatus: 201,
    body: {
      ok: true,
      deduplicated: false,
      idempotencyKey: safeIdempotencyKey,
      ticket: {
        id: ticket.id,
        ticketCode: ticket.ticketCode,
        priority: ticket.priority,
        status: ticket.status,
      },
    },
  };
}
