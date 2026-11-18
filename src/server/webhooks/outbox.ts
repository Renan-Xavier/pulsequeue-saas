import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  organizations,
  outboxJobs,
  webhookDeliveries,
  webhookEndpoints,
} from "@/db/schema";
import { recordAuditLog } from "@/lib/tenant-auth";
import { publishOrganizationEvent } from "@/server/realtime/bus";
import {
  computeNextRetryDelaySeconds,
  signWebhookPayload,
  verifyWebhookSignature,
} from "./hmac";

export interface OutboxEnqueueParams {
  organizationId: string;
  eventType: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
}

/**
 * Enqueues a transactional outbox job idempotently and attempts immediate dispatch
 * against active webhook endpoints for the tenant organization.
 */
export async function enqueueAndDispatchOutbox(params: OutboxEnqueueParams) {
  const db = getDb();

  const existing = await db
    .select()
    .from(outboxJobs)
    .where(
      and(
        eq(outboxJobs.organizationId, params.organizationId),
        eq(outboxJobs.idempotencyKey, params.idempotencyKey)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  const jobId = `job_${crypto.randomUUID()}`;
  const [inserted] = await db
    .insert(outboxJobs)
    .values({
      id: jobId,
      organizationId: params.organizationId,
      eventType: params.eventType,
      idempotencyKey: params.idempotencyKey,
      payload: params.payload,
      status: "PENDING",
      attempts: 0,
      maxAttempts: 4,
    })
    .returning();

  return processOutboxJob(inserted.id);
}

/**
 * Executes delivery for a single outbox job, applying HMAC-SHA256 signatures
 * and updating retry/Dead-Letter state on failures.
 */
export async function processOutboxJob(jobId: string) {
  const db = getDb();
  const [job] = await db
    .select()
    .from(outboxJobs)
    .where(eq(outboxJobs.id, jobId))
    .limit(1);

  if (!job) {
    throw new Error(`Outbox job ${jobId} not found`);
  }

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, job.organizationId))
    .limit(1);

  if (!org) {
    throw new Error(`Organization ${job.organizationId} not found`);
  }

  const endpoints = await db
    .select()
    .from(webhookEndpoints)
    .where(
      and(
        eq(webhookEndpoints.organizationId, job.organizationId),
        eq(webhookEndpoints.isActive, true)
      )
    )
    .orderBy(desc(webhookEndpoints.createdAt));

  const nextAttempt = job.attempts + 1;
  const rawBody = JSON.stringify({
    id: job.id,
    event: job.eventType,
    organizationSlug: org.slug,
    idempotencyKey: job.idempotencyKey,
    timestamp: new Date().toISOString(),
    data: job.payload,
  });
  const signatureHeader = signWebhookPayload(rawBody, org.webhookSecret);

  if (endpoints.length === 0) {
    const [updated] = await db
      .update(outboxJobs)
      .set({
        status: "DELIVERED",
        attempts: nextAttempt,
        processedAt: new Date(),
        lastError: null,
      })
      .where(eq(outboxJobs.id, job.id))
      .returning();
    return updated;
  }

  let anyFailure = false;
  let lastErrorMessage = "";

  for (const endpoint of endpoints) {
    const subscribedEvents = endpoint.events.split(",").map((e) => e.trim());
    if (
      !subscribedEvents.includes("*") &&
      !subscribedEvents.includes(job.eventType)
    ) {
      continue;
    }

    const deliveryKey = `${job.idempotencyKey}:${endpoint.id}`;
    const existingDelivery = await db
      .select()
      .from(webhookDeliveries)
      .where(
        and(
          eq(webhookDeliveries.organizationId, job.organizationId),
          eq(webhookDeliveries.direction, "OUTBOUND"),
          eq(webhookDeliveries.idempotencyKey, deliveryKey)
        )
      )
      .limit(1);

    if (existingDelivery.length > 0 && existingDelivery[0].status === "DELIVERED") {
      continue;
    }

    let httpStatus = 200;
    let deliveryStatus: "DELIVERED" | "FAILED" = "DELIVERED";
    let responseSummary = "";

    if (endpoint.url.startsWith("internal://")) {
      const check = verifyWebhookSignature({
        rawBody,
        headerValue: signatureHeader,
        secret: org.webhookSecret,
      });
      if (check.valid) {
        httpStatus = 200;
        deliveryStatus = "DELIVERED";
        responseSummary = "HMAC-SHA256 verificado no receptor interno de auditoria";
      } else {
        httpStatus = 401;
        deliveryStatus = "FAILED";
        responseSummary = `Falha na assinatura interna: ${check.reason}`;
      }
    } else {
      try {
        const res = await fetch(endpoint.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Pulse-Signature": signatureHeader,
            "Idempotency-Key": job.idempotencyKey,
          },
          body: rawBody,
          signal: AbortSignal.timeout(4000),
        });
        httpStatus = res.status;
        if (res.ok) {
          deliveryStatus = "DELIVERED";
          responseSummary = `HTTP ${res.status} OK`;
        } else {
          deliveryStatus = "FAILED";
          responseSummary = `HTTP ${res.status} ${res.statusText}`.trim();
          anyFailure = true;
          lastErrorMessage = responseSummary;
        }
      } catch (err) {
        anyFailure = true;
        httpStatus = 502;
        deliveryStatus = "FAILED";
        lastErrorMessage =
          err instanceof Error ? err.message : "Erro de rede ao entregar webhook";
        responseSummary = lastErrorMessage;
      }
    }

    if (existingDelivery.length > 0) {
      await db
        .update(webhookDeliveries)
        .set({
          signatureHeader,
          httpStatus,
          status: deliveryStatus,
          responseSummary,
          payload: JSON.parse(rawBody),
        })
        .where(eq(webhookDeliveries.id, existingDelivery[0].id));
    } else {
      await db.insert(webhookDeliveries).values({
        id: `del_${crypto.randomUUID()}`,
        organizationId: job.organizationId,
        direction: "OUTBOUND",
        eventType: job.eventType,
        targetUrl: endpoint.url,
        idempotencyKey: deliveryKey,
        signatureHeader,
        httpStatus,
        status: deliveryStatus,
        responseSummary,
        payload: JSON.parse(rawBody),
      });
    }
  }

  if (anyFailure) {
    const reachedMax = nextAttempt >= job.maxAttempts;
    const delaySec = computeNextRetryDelaySeconds(nextAttempt);
    const [failedJob] = await db
      .update(outboxJobs)
      .set({
        status: reachedMax ? "DEAD_LETTER" : "PENDING",
        attempts: nextAttempt,
        lastError: lastErrorMessage,
        nextRetryAt: new Date(Date.now() + delaySec * 1000),
      })
      .where(eq(outboxJobs.id, job.id))
      .returning();

    await recordAuditLog({
      organizationId: job.organizationId,
      action: reachedMax ? "OUTBOX_DEAD_LETTER" : "OUTBOX_RETRY_SCHEDULED",
      entityType: "outbox_job",
      entityId: job.id,
      metadata: {
        eventType: job.eventType,
        attempts: nextAttempt,
        lastError: lastErrorMessage,
      },
    });

    publishOrganizationEvent({
      type: "webhook.processed",
      organizationId: job.organizationId,
      timestamp: new Date().toISOString(),
      summary: `Webhook ${job.eventType} falhou (${lastErrorMessage})`,
      entityId: job.id,
    });

    return failedJob;
  }

  const [deliveredJob] = await db
    .update(outboxJobs)
    .set({
      status: "DELIVERED",
      attempts: nextAttempt,
      lastError: null,
      processedAt: new Date(),
    })
    .where(eq(outboxJobs.id, job.id))
    .returning();

  publishOrganizationEvent({
    type: "webhook.processed",
    organizationId: job.organizationId,
    timestamp: new Date().toISOString(),
    summary: `Evento ${job.eventType} entregue com assinatura HMAC`,
    entityId: job.id,
  });

  return deliveredJob;
}
