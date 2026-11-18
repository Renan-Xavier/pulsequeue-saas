import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import {
  organizations,
  outboxJobs,
  webhookDeliveries,
  webhookEndpoints,
} from "@/db/schema";
import { recordAuditLog, requireApiTenantSession } from "@/lib/tenant-auth";
import { processOutboxJob } from "@/server/webhooks/outbox";

const postWebhookActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create-endpoint"),
    name: z.string().min(2).max(80),
    url: z.string().min(4).max(240),
    events: z.string().min(1).max(160).default("*"),
  }),
  z.object({
    action: z.literal("rotate-secret"),
  }),
  z.object({
    action: z.literal("retry-job"),
    jobId: z.string().min(4),
  }),
]);

export async function GET() {
  const authResult = await requireApiTenantSession();
  if (!authResult.ok) return authResult.response;

  const { organization, role } = authResult.session;
  const db = getDb();

  const [endpoints, jobs, deliveries] = await Promise.all([
    db
      .select()
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.organizationId, organization.id))
      .orderBy(desc(webhookEndpoints.createdAt)),
    db
      .select()
      .from(outboxJobs)
      .where(eq(outboxJobs.organizationId, organization.id))
      .orderBy(desc(outboxJobs.createdAt))
      .limit(20),
    db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.organizationId, organization.id))
      .orderBy(desc(webhookDeliveries.createdAt))
      .limit(25),
  ]);

  const maskedSecret = `${organization.webhookSecret.slice(0, 10)}••••••••••••${organization.webhookSecret.slice(-4)}`;

  return NextResponse.json({
    role,
    userEmail: authResult.session.user.email,
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      ingestPath: `/api/webhooks/ingest/${organization.slug}`,
      webhookSecretPreview:
        role === "ADMIN" ? organization.webhookSecret : maskedSecret,
    },
    endpoints,
    outboxJobs: jobs,
    deliveries,
  });
}

export async function POST(request: Request) {
  const authResult = await requireApiTenantSession(["ADMIN"]);
  if (!authResult.ok) return authResult.response;

  const body = await request.json().catch(() => null);
  const parsed = postWebhookActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Operação de webhook inválida.", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const { organization, user } = authResult.session;
  const db = getDb();

  if (parsed.data.action === "create-endpoint") {
    const rawUrl = parsed.data.url.trim();
    if (
      !rawUrl.startsWith("https://") &&
      !rawUrl.startsWith("http://") &&
      !rawUrl.startsWith("internal://")
    ) {
      return NextResponse.json(
        { error: "URL deve começar com https://, http:// ou internal://" },
        { status: 422 }
      );
    }

    const [created] = await db
      .insert(webhookEndpoints)
      .values({
        id: `whk_${crypto.randomUUID()}`,
        organizationId: organization.id,
        name: parsed.data.name.trim(),
        url: rawUrl,
        events: parsed.data.events.trim(),
        isActive: true,
      })
      .returning();

    await recordAuditLog({
      organizationId: organization.id,
      actorUserId: user.id,
      actorEmail: user.email,
      action: "WEBHOOK_ENDPOINT_CREATED",
      entityType: "webhook_endpoint",
      entityId: created.id,
      metadata: { name: created.name, url: created.url },
    });

    return NextResponse.json({ endpoint: created }, { status: 201 });
  }

  if (parsed.data.action === "rotate-secret") {
    const nextSecret = `whsec_${crypto.randomBytes(18).toString("hex")}`;
    await db
      .update(organizations)
      .set({ webhookSecret: nextSecret })
      .where(eq(organizations.id, organization.id));

    await recordAuditLog({
      organizationId: organization.id,
      actorUserId: user.id,
      actorEmail: user.email,
      action: "WEBHOOK_SECRET_ROTATED",
      entityType: "organization",
      entityId: organization.id,
      metadata: { rotatedAt: new Date().toISOString() },
    });

    return NextResponse.json({ ok: true, webhookSecret: nextSecret });
  }

  const [job] = await db
    .select()
    .from(outboxJobs)
    .where(
      and(
        eq(outboxJobs.id, parsed.data.jobId),
        eq(outboxJobs.organizationId, organization.id)
      )
    )
    .limit(1);

  if (!job) {
    return NextResponse.json(
      { error: "Job não encontrado na fila Outbox." },
      { status: 404 }
    );
  }

  const reprocessed = await processOutboxJob(job.id);
  return NextResponse.json({ ok: true, job: reprocessed });
}
