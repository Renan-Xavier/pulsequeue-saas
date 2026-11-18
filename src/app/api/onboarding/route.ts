import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { provisionOrganizationForUser } from "@/lib/tenant-auth";

const onboardingSchema = z.object({
  organizationName: z.string().min(2).max(80),
});

export async function POST(request: Request) {
  const session = await getAuth().api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return NextResponse.json(
      { error: "Sessão necessária para criar organização." },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = onboardingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Nome da organização inválido.", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const org = await provisionOrganizationForUser({
    userId: session.user.id,
    userEmail: session.user.email,
    userName: session.user.name,
    organizationName: parsed.data.organizationName,
  });

  return NextResponse.json({ ok: true, organization: org }, { status: 201 });
}
