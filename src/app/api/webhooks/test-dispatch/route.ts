import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiTenantSession } from "@/lib/tenant-auth";
import { signWebhookPayload } from "@/server/webhooks/hmac";
import { ingestSignedWebhook } from "@/server/webhooks/ingest";

const testDispatchSchema = z.object({
  idempotencyKey: z.string().min(3).max(120),
  customerName: z.string().min(2).max(120),
  subject: z.string().min(3).max(200),
  priority: z.enum(["URGENT", "HIGH", "NORMAL"]).default("HIGH"),
  tamperSignature: z.boolean().default(false),
});

export async function POST(request: Request) {
  const authResult = await requireApiTenantSession(["ADMIN", "OPERATOR"]);
  if (!authResult.ok) return authResult.response;

  const body = await request.json().catch(() => null);
  const parsed = testDispatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload de teste inválido.", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const { organization } = authResult.session;
  const rawPayload = JSON.stringify({
    event: "ticket.inbound",
    customerName: parsed.data.customerName,
    subject: parsed.data.subject,
    priority: parsed.data.priority,
  });

  let signatureHeader = signWebhookPayload(rawPayload, organization.webhookSecret);
  if (parsed.data.tamperSignature) {
    signatureHeader = signatureHeader.slice(0, -6) + "dead00";
  }

  const result = await ingestSignedWebhook({
    orgSlug: organization.slug,
    rawBody: rawPayload,
    signatureHeader,
    idempotencyKey: parsed.data.idempotencyKey,
    targetUrl: `/api/webhooks/ingest/${organization.slug}`,
  });

  return NextResponse.json(
    {
      ...result.body,
      simulatedHttpStatus: result.httpStatus,
      sentHeaders: {
        "X-Pulse-Signature": signatureHeader,
        "Idempotency-Key": parsed.data.idempotencyKey,
      },
    },
    { status: result.httpStatus }
  );
}
