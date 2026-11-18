import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { organizations, queues } from "@/db/schema";
import { createTicketInQueue } from "@/server/queues/ticket-service";

const publicTicketSchema = z.object({
  orgSlug: z.string().min(2).max(60),
  queueId: z.string().min(3),
  customerName: z.string().min(2).max(120),
  customerContact: z.string().max(120).optional(),
  subject: z.string().min(3).max(200),
  priority: z.enum(["URGENT", "HIGH", "NORMAL"]).default("NORMAL"),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = publicTicketSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Preencha corretamente os dados do atendimento.", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const db = getDb();
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, parsed.data.orgSlug))
    .limit(1);

  if (!org) {
    return NextResponse.json(
      { error: "Organização não encontrada." },
      { status: 404 }
    );
  }

  const [queue] = await db
    .select({ id: queues.id })
    .from(queues)
    .where(
      and(
        eq(queues.id, parsed.data.queueId),
        eq(queues.organizationId, org.id)
      )
    )
    .limit(1);

  if (!queue) {
    return NextResponse.json(
      { error: "Fila não pertence à organização selecionada." },
      { status: 400 }
    );
  }

  const created = await createTicketInQueue({
    organizationId: org.id,
    queueId: queue.id,
    customerName: parsed.data.customerName,
    customerContact: parsed.data.customerContact,
    subject: parsed.data.subject,
    priority: parsed.data.priority,
    actorEmail: "portal-totem@pulsequeue.dev",
  });

  return NextResponse.json(
    {
      ticket: {
        id: created.id,
        ticketCode: created.ticketCode,
        priority: created.priority,
        status: created.status,
        slaDeadlineAt: created.slaDeadlineAt,
      },
    },
    { status: 201 }
  );
}
