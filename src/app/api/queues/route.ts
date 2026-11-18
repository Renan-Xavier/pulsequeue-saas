import crypto from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { queues } from "@/db/schema";
import { recordAuditLog, requireApiTenantSession } from "@/lib/tenant-auth";
import { publishOrganizationEvent } from "@/server/realtime/bus";

const createQueueSchema = z.object({
  name: z.string().min(2).max(80),
  prefix: z
    .string()
    .min(1)
    .max(4)
    .regex(/^[A-Za-z0-9]+$/, "Use apenas letras ou números no prefixo."),
  description: z.string().max(180).optional(),
});

export async function GET() {
  const authResult = await requireApiTenantSession();
  if (!authResult.ok) return authResult.response;

  const db = getDb();
  const rows = await db
    .select()
    .from(queues)
    .where(eq(queues.organizationId, authResult.session.organization.id))
    .orderBy(asc(queues.createdAt));

  return NextResponse.json({ queues: rows });
}

export async function POST(request: Request) {
  const authResult = await requireApiTenantSession(["ADMIN"]);
  if (!authResult.ok) return authResult.response;

  const body = await request.json().catch(() => null);
  const parsed = createQueueSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos para criar fila.", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const db = getDb();
  const queueId = `que_${crypto.randomUUID()}`;
  const [created] = await db
    .insert(queues)
    .values({
      id: queueId,
      organizationId: authResult.session.organization.id,
      name: parsed.data.name.trim(),
      prefix: parsed.data.prefix.trim().toUpperCase(),
      description: (parsed.data.description ?? "").trim(),
      isActive: true,
      nextSequence: 1,
    })
    .returning();

  await recordAuditLog({
    organizationId: authResult.session.organization.id,
    actorUserId: authResult.session.user.id,
    actorEmail: authResult.session.user.email,
    action: "QUEUE_CREATED",
    entityType: "queue",
    entityId: created.id,
    metadata: { name: created.name, prefix: created.prefix },
  });

  publishOrganizationEvent({
    type: "ticket.updated",
    organizationId: authResult.session.organization.id,
    timestamp: new Date().toISOString(),
    summary: `Nova fila "${created.name}" (${created.prefix}) criada`,
    entityId: created.id,
  });

  return NextResponse.json({ queue: created }, { status: 201 });
}
