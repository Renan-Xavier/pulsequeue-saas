import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { auditLogs, memberships, user } from "@/db/schema";
import { requireApiTenantSession } from "@/lib/tenant-auth";

export async function GET() {
  const authResult = await requireApiTenantSession();
  if (!authResult.ok) return authResult.response;

  const { organization } = authResult.session;
  const db = getDb();

  const [logs, members] = await Promise.all([
    db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.organizationId, organization.id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(50),
    db
      .select({
        id: memberships.id,
        role: memberships.role,
        createdAt: memberships.createdAt,
        userId: user.id,
        name: user.name,
        email: user.email,
      })
      .from(memberships)
      .innerJoin(user, eq(memberships.userId, user.id))
      .where(eq(memberships.organizationId, organization.id)),
  ]);

  return NextResponse.json({
    role: authResult.session.role,
    userEmail: authResult.session.user.email,
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      plan: organization.plan,
    },
    logs,
    members,
  });
}
