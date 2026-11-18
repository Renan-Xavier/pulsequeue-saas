import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiTenantSession } from "@/lib/tenant-auth";
import { callNextWaitingTicket } from "@/server/queues/ticket-service";

const callNextSchema = z.object({
  queueId: z.string().optional(),
  deskLabel: z.string().min(2).max(40).default("Guichê 01"),
});

export async function POST(request: Request) {
  const authResult = await requireApiTenantSession(["ADMIN", "OPERATOR"]);
  if (!authResult.ok) return authResult.response;

  const body = await request.json().catch(() => ({}));
  const parsed = callNextSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Parâmetros inválidos.", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const called = await callNextWaitingTicket({
    organizationId: authResult.session.organization.id,
    queueId: parsed.data.queueId,
    deskLabel: parsed.data.deskLabel,
    actorUserId: authResult.session.user.id,
    actorEmail: authResult.session.user.email,
  });

  if (!called) {
    return NextResponse.json(
      { error: "Não há senhas aguardando na fila no momento." },
      { status: 404 }
    );
  }

  return NextResponse.json({ ticket: called });
}
