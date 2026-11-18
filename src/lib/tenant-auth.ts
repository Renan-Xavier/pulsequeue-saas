import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { auditLogs, memberships, organizations, queues } from "@/db/schema";
import { getAuth } from "@/lib/auth";

export type OrgRole = "ADMIN" | "OPERATOR" | "VIEWER";

export interface TenantSession {
  user: {
    id: string;
    name: string;
    email: string;
  };
  organization: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    slaTargetMinutes: number;
    webhookSecret: string;
  };
  role: OrgRole;
}

/**
 * Resolves the authenticated Better Auth session and active multi-tenant membership.
 */
export async function getTenantSession(): Promise<TenantSession | null> {
  const reqHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: reqHeaders });
  if (!session?.user) {
    return null;
  }

  const db = getDb();
  const rows = await db
    .select({
      role: memberships.role,
      orgId: organizations.id,
      orgName: organizations.name,
      orgSlug: organizations.slug,
      orgPlan: organizations.plan,
      slaTargetMinutes: organizations.slaTargetMinutes,
      webhookSecret: organizations.webhookSecret,
    })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.organizationId, organizations.id))
    .where(eq(memberships.userId, session.user.id))
    .limit(1);

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return {
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
    },
    organization: {
      id: row.orgId,
      name: row.orgName,
      slug: row.orgSlug,
      plan: row.orgPlan,
      slaTargetMinutes: row.slaTargetMinutes,
      webhookSecret: row.webhookSecret,
    },
    role: row.role as OrgRole,
  };
}

/**
 * Guards an API route handler, verifying authentication, tenant membership, and RBAC roles.
 */
export async function requireApiTenantSession(
  allowedRoles?: readonly OrgRole[]
): Promise<
  | { ok: true; session: TenantSession }
  | { ok: false; response: NextResponse }
> {
  const tenantSession = await getTenantSession();

  if (!tenantSession) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Não autenticado. Faça login para acessar esta operação." },
        { status: 401 }
      ),
    };
  }

  if (allowedRoles && !allowedRoles.includes(tenantSession.role)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: `Acesso negado (RBAC): papel ${tenantSession.role} não possui permissão.`,
        },
        { status: 403 }
      ),
    };
  }

  return { ok: true, session: tenantSession };
}

/**
 * Provisions a default isolated organization, ADMIN membership, and starter queue
 * when a new user registers via email/password sign-up.
 */
export async function provisionOrganizationForUser(params: {
  userId: string;
  userEmail: string;
  userName: string;
  organizationName: string;
}): Promise<{ organizationId: string; slug: string }> {
  const db = getDb();

  const existingMembership = await db
    .select({ organizationId: memberships.organizationId })
    .from(memberships)
    .where(eq(memberships.userId, params.userId))
    .limit(1);

  if (existingMembership.length > 0) {
    const [org] = await db
      .select({ id: organizations.id, slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, existingMembership[0].organizationId))
      .limit(1);
    if (org) return { organizationId: org.id, slug: org.slug };
  }

  const baseSlug = params.organizationName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);

  const uniqueSuffix = crypto.randomBytes(2).toString("hex");
  const slug = `${baseSlug || "tenant"}-${uniqueSuffix}`;
  const organizationId = `org_${crypto.randomUUID()}`;
  const webhookSecret = `whsec_${crypto.randomBytes(18).toString("hex")}`;

  await db.insert(organizations).values({
    id: organizationId,
    name: params.organizationName.trim(),
    slug,
    plan: "PRO",
    slaTargetMinutes: 15,
    webhookSecret,
  });

  await db.insert(memberships).values({
    id: `mem_${crypto.randomUUID()}`,
    userId: params.userId,
    organizationId,
    role: "ADMIN",
  });

  await db.insert(queues).values({
    id: `que_${crypto.randomUUID()}`,
    organizationId,
    name: "Atendimento Geral",
    prefix: "AG",
    description: "Fila padrão criada no onboarding do workspace",
    isActive: true,
    nextSequence: 1,
  });

  await db.insert(auditLogs).values({
    id: `aud_${crypto.randomUUID()}`,
    organizationId,
    actorUserId: params.userId,
    actorEmail: params.userEmail,
    action: "ORGANIZATION_PROVISIONED",
    entityType: "organization",
    entityId: organizationId,
    metadata: {
      organizationName: params.organizationName,
      slug,
      ownerName: params.userName,
    },
  });

  return { organizationId, slug };
}

/**
 * Records an immutable audit trail entry scoped to a single organization.
 */
export async function recordAuditLog(params: {
  organizationId: string;
  actorUserId?: string | null;
  actorEmail?: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}) {
  const db = getDb();
  const [created] = await db
    .insert(auditLogs)
    .values({
      id: `aud_${crypto.randomUUID()}`,
      organizationId: params.organizationId,
      actorUserId: params.actorUserId ?? null,
      actorEmail: params.actorEmail ?? "system@pulsequeue.dev",
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      metadata: params.metadata ?? {},
    })
    .returning();
  return created;
}

/**
 * Checks whether a user belongs to the given organization.
 */
export async function getUserMembershipInOrg(userId: string, orgId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(memberships)
    .where(
      and(eq(memberships.userId, userId), eq(memberships.organizationId, orgId))
    )
    .limit(1);
  return rows[0] ?? null;
}
