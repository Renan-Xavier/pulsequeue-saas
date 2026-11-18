import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiTenantSession } from "@/lib/tenant-auth";
import { transitionTicketStatus } from "@/server/queues/ticket-service";

const patchTicketSchema = z.object({
  nextStatus: z.enum(["WAITING", "IN_PROGRESS", "COMPLETED", "CANCELLED"]),
  deskLabel: z.string().max(40).optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const authResult = await requireApiTenantSession(["ADMIN", "OPERATOR"]);
  if (!authResult.ok) return authResult.response;

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = patchTicketSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Transição inválida.", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  try {
    const ticket = await transitionTicketStatus({
      organizationId: authResult.session.organization.id,
      ticketId: id,
      nextStatus: parsed.data.nextStatus,
      deskLabel: parsed.data.deskLabel,
      actorUserId: authResult.session.user.id,
      actorEmail: authResult.session.user.email,
    });

    return NextResponse.json({ ticket });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao atualizar";
    if (message === "TICKET_NOT_FOUND") {
      return NextResponse.json(
        { error: "Ticket não encontrado neste workspace." },
        { status: 404 }
      );
    }
    if (message.startsWith("INVALID_TRANSITION")) {
      return NextResponse.json(
        { error: `Transição de estado não permitida (${message}).` },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
