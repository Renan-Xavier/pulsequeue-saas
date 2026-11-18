import { describe, expect, it } from "vitest";
import {
  computeNextRetryDelaySeconds,
  parseSignatureHeader,
  signWebhookPayload,
  verifyWebhookSignature,
} from "@/server/webhooks/hmac";

describe("Webhook HMAC-SHA256 Signing & Verification", () => {
  const secret = "whsec_pulsequeue_test_secret_123456";
  const payload = JSON.stringify({
    event: "ticket.created",
    ticketCode: "PR-007",
    customerName: "João Silva",
  });

  it("signs and verifies a valid payload within tolerance window", () => {
    const now = 1_760_000_000;
    const header = signWebhookPayload(payload, secret, now);

    const parsed = parseSignatureHeader(header);
    expect(parsed).not.toBeNull();
    expect(parsed?.timestamp).toBe(now);
    expect(parsed?.signature).toMatch(/^[a-f0-9]{64}$/);

    const result = verifyWebhookSignature({
      rawBody: payload,
      headerValue: header,
      secret,
      nowSeconds: now + 60,
    });
    expect(result).toEqual({ valid: true });
  });

  it("rejects tampered payload with SIGNATURE_MISMATCH", () => {
    const now = 1_760_000_000;
    const header = signWebhookPayload(payload, secret, now);

    const result = verifyWebhookSignature({
      rawBody: payload.replace("PR-007", "PR-999"),
      headerValue: header,
      secret,
      nowSeconds: now + 5,
    });
    expect(result).toEqual({ valid: false, reason: "SIGNATURE_MISMATCH" });
  });

  it("rejects expired timestamps against replay attacks", () => {
    const now = 1_760_000_000;
    const header = signWebhookPayload(payload, secret, now - 600);

    const result = verifyWebhookSignature({
      rawBody: payload,
      headerValue: header,
      secret,
      nowSeconds: now,
      toleranceSeconds: 300,
    });
    expect(result).toEqual({ valid: false, reason: "TIMESTAMP_EXPIRED" });
  });

  it("rejects missing or malformed signature headers", () => {
    expect(
      verifyWebhookSignature({ rawBody: payload, headerValue: null, secret })
    ).toEqual({ valid: false, reason: "MISSING_HEADER" });

    expect(
      verifyWebhookSignature({ rawBody: payload, headerValue: "invalid", secret })
    ).toEqual({ valid: false, reason: "MALFORMED_HEADER" });
  });

  it("computes bounded exponential backoff for outbox retries", () => {
    expect(computeNextRetryDelaySeconds(1)).toBe(30);
    expect(computeNextRetryDelaySeconds(2)).toBe(120);
    expect(computeNextRetryDelaySeconds(3)).toBe(480);
    expect(computeNextRetryDelaySeconds(4)).toBe(1800);
    expect(computeNextRetryDelaySeconds(8)).toBe(1800);
  });
});
