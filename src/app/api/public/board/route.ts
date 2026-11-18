import { asc, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { organizations, queues, tickets } from "@/db/schema";
import {
  compareQueueTickets,
  evaluateSlaHealth,
  type TicketPriority,
  type TicketStatus,
} from "@/server/queues/sla";

function maskCustomerDisplay(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return parts[0] || "Cliente";
  const first = parts[0];
  const lastInitial = parts[parts.length - 1][0] ?? "";
  return `${first} ${lastInitial.toUpperCase()}.`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("org") || "techlog-brasil";
  const db = getDb();

  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      slaTargetMinutes: organizations.slaTargetMinutes,
    })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);

  if (!org) {
    return NextResponse.json(
      { error: "Painel não encontrado para esta organização." },
      { status: 404 }
    );
  }

  const allOrgs = await db
    .select({ name: organizations.name, slug: organizations.slug })
    .from(organizations)
    .orderBy(asc(organizations.createdAt));

  const [orgQueues, orgTickets] = await Promise.all([
    db
      .select({
        id: queues.id,
        name: queues.name,
        prefix: queues.prefix,
        description: queues.description,
      })
      .from(queues)
      .where(eq(queues.organizationId, org.id))
      .orderBy(asc(queues.createdAt)),
    db
      .select()
      .from(tickets)
      .where(eq(tickets.organizationId, org.id))
      .orderBy(desc(tickets.startedAt), desc(tickets.createdAt)),
  ]);

  const queueMap = new Map(orgQueues.map((q) => [q.id, q.name]));
  const now = new Date();

  const sanitized = orgTickets.map((t) => ({
    id: t.id,
    ticketCode: t.ticketCode,
    displayCustomer: maskCustomerDisplay(t.customerName),
    queueName: queueMap.get(t.queueId) ?? "Geral",
    priority: t.priority,
    status: t.status,
    deskLabel: t.deskLabel,
    slaHealth: evaluateSlaHealth(
      t.createdAt,
      t.slaDeadlineAt,
      t.status as TicketStatus,
      now
    ),
    startedAt: t.startedAt,
    createdAt: t.createdAt,
  }));

  const waiting = orgTickets
    .filter((t) => t.status === "WAITING")
    .sort((a, b) =>
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
    )
    .map((t) => ({
      id: t.id,
      ticketCode: t.ticketCode,
      displayCustomer: maskCustomerDisplay(t.customerName),
      queueName: queueMap.get(t.queueId) ?? "Geral",
      priority: t.priority,
      slaHealth: evaluateSlaHealth(
        t.createdAt,
        t.slaDeadlineAt,
        t.status as TicketStatus,
        now
      ),
      createdAt: t.createdAt,
    }));

  return NextResponse.json({
    organization: org,
    availableOrgs: allOrgs,
    queues: orgQueues,
    inProgress: sanitized.filter((t) => t.status === "IN_PROGRESS"),
    waiting,
    recentCompleted: sanitized
      .filter((t) => t.status === "COMPLETED")
      .slice(0, 6),
  });
}
