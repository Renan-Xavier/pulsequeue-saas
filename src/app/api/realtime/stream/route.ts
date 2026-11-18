import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, organizations } from "@/db/schema";
import { getTenantSession } from "@/lib/tenant-auth";
import { subscribeOrganizationEvents } from "@/server/realtime/bus";

/**
 * Server-Sent Events (SSE) stream delivering instant in-instance events plus
 * cross-instance PostgreSQL revision checks for multi-tab live sync.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const orgSlugParam = url.searchParams.get("org");

  let organizationId: string | null = null;

  if (orgSlugParam) {
    const db = getDb();
    const [org] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, orgSlugParam))
      .limit(1);
    organizationId = org?.id ?? null;
  } else {
    const session = await getTenantSession();
    organizationId = session?.organization.id ?? null;
  }

  if (!organizationId) {
    return Response.json(
      { error: "Organização não identificada para stream SSE." },
      { status: 401 }
    );
  }

  const resolvedOrgId = organizationId;
  const encoder = new TextEncoder();

  async function readRevisionMarker(): Promise<string> {
    const db = getDb();
    const [latest] = await db
      .select({
        id: auditLogs.id,
        createdAt: auditLogs.createdAt,
        count: sql<number>`count(*) over()::int`,
      })
      .from(auditLogs)
      .where(eq(auditLogs.organizationId, resolvedOrgId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(1);

    if (!latest) return "0:none";
    return `${latest.count}:${latest.id}`;
  }

  let initialRevision = "0:none";
  try {
    initialRevision = await readRevisionMarker();
  } catch {
    initialRevision = "0:err";
  }

  let cleanupFn: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let lastRevision = initialRevision;
      const startedAt = Date.now();

      const safeSend = (payload: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
          );
        } catch {
          closed = true;
          cleanupFn?.();
        }
      };

      try {
        controller.enqueue(encoder.encode("retry: 1500\n\n"));
      } catch {
        closed = true;
        return;
      }

      safeSend({
        type: "connected",
        organizationId: resolvedOrgId,
        timestamp: new Date().toISOString(),
        summary: "Stream SSE conectado",
      });

      const unsubscribe = subscribeOrganizationEvents(resolvedOrgId, (event) => {
        safeSend(event as unknown as Record<string, unknown>);
      });

      const pollTimer = setInterval(async () => {
        if (closed) return;

        // Reconnect gracefully before Vercel 300s ceiling
        if (Date.now() - startedAt > 240_000) {
          closed = true;
          cleanupFn?.();
          try {
            controller.close();
          } catch {}
          return;
        }

        try {
          const nextRev = await readRevisionMarker();
          if (nextRev !== lastRevision) {
            lastRevision = nextRev;
            safeSend({
              type: "sync.revision",
              organizationId: resolvedOrgId,
              timestamp: new Date().toISOString(),
              summary: "Sincronização de fila atualizada",
            });
          }
        } catch {
          // Ignore transient polling failures
        }
      }, 2000);

      const heartbeatTimer = setInterval(() => {
        if (closed) return;
        safeSend({
          type: "ping",
          organizationId: resolvedOrgId,
          timestamp: new Date().toISOString(),
          summary: "heartbeat",
        });
      }, 15_000);

      cleanupFn = () => {
        closed = true;
        clearInterval(pollTimer);
        clearInterval(heartbeatTimer);
        unsubscribe();
      };

      request.signal.addEventListener("abort", () => {
        cleanupFn?.();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      cleanupFn?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
