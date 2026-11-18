import { NextResponse } from "next/server";
import { ingestSignedWebhook } from "@/server/webhooks/ingest";

export async function POST(
  request: Request,
  context: { params: Promise<{ orgSlug: string }> }
) {
  const { orgSlug } = await context.params;
  const rawBody = await request.text();
  const signatureHeader = request.headers.get("x-pulse-signature");
  const idempotencyKey = request.headers.get("idempotency-key");

  const result = await ingestSignedWebhook({
    orgSlug,
    rawBody,
    signatureHeader,
    idempotencyKey,
    targetUrl: `/api/webhooks/ingest/${orgSlug}`,
  });

  return NextResponse.json(result.body, { status: result.httpStatus });
}
