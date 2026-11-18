import crypto from "node:crypto";

export interface ParsedSignature {
  timestamp: number;
  signature: string;
}

export interface SignatureVerificationResult {
  valid: boolean;
  reason?:
    | "MISSING_HEADER"
    | "MALFORMED_HEADER"
    | "TIMESTAMP_EXPIRED"
    | "SIGNATURE_MISMATCH";
}

const DEFAULT_TOLERANCE_SECONDS = 300;

/**
 * Generates an HMAC-SHA256 signature header in the `t=<unix>,v1=<hex>` format
 * used across outbound and inbound PulseQueue webhook contracts.
 */
export function signWebhookPayload(
  rawBody: string,
  secret: string,
  timestampSeconds: number = Math.floor(Date.now() / 1000)
): string {
  const signedContent = `${timestampSeconds}.${rawBody}`;
  const digest = crypto
    .createHmac("sha256", secret)
    .update(signedContent, "utf8")
    .digest("hex");

  return `t=${timestampSeconds},v1=${digest}`;
}

/**
 * Parses a `t=<unix>,v1=<hex>` signature header into structured fields.
 */
export function parseSignatureHeader(headerValue: string | null | undefined): ParsedSignature | null {
  if (!headerValue) return null;

  const parts = headerValue.split(",").map((part) => part.trim());
  let timestamp: number | null = null;
  let signature: string | null = null;

  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key === "t" && value) {
      const parsed = Number(value);
      if (Number.isInteger(parsed) && parsed > 0) {
        timestamp = parsed;
      }
    } else if (key === "v1" && value) {
      signature = value;
    }
  }

  if (timestamp === null || !signature) return null;
  return { timestamp, signature };
}

/**
 * Verifies an HMAC-SHA256 webhook signature using constant-time comparison
 * and replay window enforcement.
 */
export function verifyWebhookSignature(params: {
  rawBody: string;
  headerValue: string | null | undefined;
  secret: string;
  nowSeconds?: number;
  toleranceSeconds?: number;
}): SignatureVerificationResult {
  const {
    rawBody,
    headerValue,
    secret,
    nowSeconds = Math.floor(Date.now() / 1000),
    toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
  } = params;

  if (!headerValue) {
    return { valid: false, reason: "MISSING_HEADER" };
  }

  const parsed = parseSignatureHeader(headerValue);
  if (!parsed) {
    return { valid: false, reason: "MALFORMED_HEADER" };
  }

  if (Math.abs(nowSeconds - parsed.timestamp) > toleranceSeconds) {
    return { valid: false, reason: "TIMESTAMP_EXPIRED" };
  }

  const expectedHeader = signWebhookPayload(rawBody, secret, parsed.timestamp);
  const expectedSig = parseSignatureHeader(expectedHeader)?.signature ?? "";

  const actualBuf = Buffer.from(parsed.signature, "utf8");
  const expectedBuf = Buffer.from(expectedSig, "utf8");

  if (
    actualBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(actualBuf, expectedBuf)
  ) {
    return { valid: false, reason: "SIGNATURE_MISMATCH" };
  }

  return { valid: true };
}

/**
 * Computes the next retry delay in seconds using bounded exponential backoff
 * (`30s * 4^(attempt - 1)` capped at 1800s) for transactional outbox jobs.
 */
export function computeNextRetryDelaySeconds(attemptNumber: number): number {
  const safeAttempt = Math.max(1, attemptNumber);
  return Math.min(1800, 30 * Math.pow(4, safeAttempt - 1));
}
