import { asc, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { queues, tickets } from "@/db/schema";
import { requireApiTenantSession } from "@/lib/tenant-auth";
import {
  compareQueueTickets,
  evaluateSlaHealth,
  type TicketPriority,
  type TicketStatus,
} from "@/server/queues/sla";
import { createTicketInQueue } from "@/server/queues/ticket-service";

const createTicketSchema = z.object({
  queueId: z.string().min(3),
  customerName: z.string().min(2).max(120),
  customerContact: z.string().max(120).optional(),
  subject: z.string().min(3).max(200),
  priority: z.enum(["URGENT", "HIGH", "NORMAL"]).default("NORMAL"),
});

export async function GET() {
  const authResult = await requireApiTenantSession();
  if (!authResult.ok) return authResult.response;

  const { organization, user, role } = authResult.session;
  const db = getDb();

  const [orgQueues, orgTickets] = await Promise.all([
    db
      .select()
      .from(queues)
      .where(eq(queues.organizationId, organization.id))
      .orderBy(asc(queues.createdAt)),
    db
      .select()
      .from(tickets)
      .where(eq(tickets.organizationId, organization.id))
      .orderBy(desc(tickets.createdAt)),
  ]);

  const queueById = new Map(orgQueues.map((q) => [q.id, q]));
  const now = new Date();

  const enriched = orgTickets.map((t) => ({
    ...t,
    queueName: queueById.get(t.queueId)?.name ?? "Geral",
    queuePrefix: queueById.get(t.queueId)?.prefix ?? "PQ",
    slaHealth: evaluateSlaHealth(
      t.createdAt,
      t.slaDeadlineAt,
      t.status as TicketStatus,
      now
    ),
  }));

  const waitingSorted = enriched
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
    );

  const inProgress = enriched.filter((t) => t.status === "IN_PROGRESS");
  const completed = enriched.filter(
    (t) => t.status === "COMPLETED" || t.status === "CANCELLED"
  );

  return NextResponse.json({
    session: {
      user,
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        plan: organization.plan,
        slaTargetMinutes: organization.slaTargetMinutes,
      },
      role,
    },
    queues: orgQueues,
    waiting: waitingSorted,
    inProgress,
    completed: completed.slice(0, 20),
    stats: {
      waitingCount: waitingSorted.length,
      inProgressCount: inProgress.length,
      completedCount: completed.filter((t) => t.status === "COMPLETED").length,
      breachedCount: enriched.filter((t) => t.slaHealth === "BREACHED").length,
    },
  });
}

export async function POST(request: Request) {
  const authResult = await requireApiTenantSession(["ADMIN", "OPERATOR"]);
  if (!authResult.ok) return authResult.response;

  const body = await request.json().catch(() => null);
  const parsed = createTicketSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos para abertura de senha.", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  try {
    const ticket = await createTicketInQueue({
      organizationId: authResult.session.organization.id,
      queueId: parsed.data.queueId,
      customerName: parsed.data.customerName,
      customerContact: parsed.data.customerContact,
      subject: parsed.data.subject,
      priority: parsed.data.priority,
      actorUserId: authResult.session.user.id,
      actorEmail: authResult.session.user.email,
    });

    return NextResponse.json({ ticket }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erro ao abrir chamado.",
      },
      { status: 400 }
    );
  }
}
