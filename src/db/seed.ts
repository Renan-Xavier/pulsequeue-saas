import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLogs,
  memberships,
  organizations,
  queues,
  tickets,
  user,
  webhookDeliveries,
  webhookEndpoints,
} from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { calculateSlaDeadline, type TicketPriority } from "@/server/queues/sla";
import { signWebhookPayload } from "@/server/webhooks/hmac";

export const DEMO_PASSWORD = ["PulseQueue", "@2026"].join("");

export const DEMO_USERS = [
  {
    email: "admin@pulsequeue.dev",
    name: "Renan Xavier",
    orgId: "org_techlog_brasil",
    role: "ADMIN" as const,
  },
  {
    email: "operador@pulsequeue.dev",
    name: "Camila Torres",
    orgId: "org_techlog_brasil",
    role: "OPERATOR" as const,
  },
  {
    email: "gestor@novacare.dev",
    name: "Marcelo Lima",
    orgId: "org_novacare_saude",
    role: "ADMIN" as const,
  },
];

let seedPromise: Promise<void> | null = null;

/**
 * Ensures demo multi-tenant workspaces, queues, RBAC users, tickets, and webhook endpoints exist.
 * Idempotent across repeated calls and concurrent cold starts.
 */
export async function ensureSeedData(): Promise<void> {
  if (!seedPromise) {
    seedPromise = runIdempotentSeed().catch((err) => {
      seedPromise = null;
      throw err;
    });
  }
  return seedPromise;
}

async function runIdempotentSeed(): Promise<void> {
  const db = getDb();

  const existingOrgs = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, "org_techlog_brasil"))
    .limit(1);

  if (existingOrgs.length > 0) {
    return;
  }

  const now = new Date();

  await db
    .insert(organizations)
    .values([
      {
        id: "org_techlog_brasil",
        name: "TechLog Brasil",
        slug: "techlog-brasil",
        plan: "PRO",
        slaTargetMinutes: 15,
        webhookSecret: "whsec_techlog_demo_8f31c9a2e4b7d601",
      },
      {
        id: "org_novacare_saude",
        name: "NovaCare Saúde",
        slug: "novacare-saude",
        plan: "ENTERPRISE",
        slaTargetMinutes: 10,
        webhookSecret: "whsec_novacare_demo_4a92f1c8d7b3e502",
      },
    ])
    .onConflictDoNothing();

  const auth = getAuth();
  const userIds: Record<string, string> = {};

  for (const demo of DEMO_USERS) {
    const existingUser = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, demo.email))
      .limit(1);

    let uid = existingUser[0]?.id;
    if (!uid) {
      const signUpRes = await auth.api.signUpEmail({
        body: {
          email: demo.email,
          password: DEMO_PASSWORD,
          name: demo.name,
        },
      });
      uid = signUpRes.user.id;
    }

    userIds[demo.email] = uid;

    await db
      .insert(memberships)
      .values({
        id: `mem_${demo.orgId}_${demo.role.toLowerCase()}`,
        userId: uid,
        organizationId: demo.orgId,
        role: demo.role,
      })
      .onConflictDoNothing();
  }

  await db
    .insert(queues)
    .values([
      {
        id: "que_techlog_docas",
        organizationId: "org_techlog_brasil",
        name: "Docas Prioritárias",
        prefix: "DP",
        description: "Liberação expressa de cargas refrigeradas e urgentes",
        isActive: true,
        nextSequence: 5,
      },
      {
        id: "que_techlog_suporte",
        organizationId: "org_techlog_brasil",
        name: "Suporte Técnico N2",
        prefix: "N2",
        description: "Incidentes operacionais e integrações ERP",
        isActive: true,
        nextSequence: 3,
      },
      {
        id: "que_novacare_triagem",
        organizationId: "org_novacare_saude",
        name: "Triagem Clínica",
        prefix: "TC",
        description: "Classificação de risco Manchester em tempo real",
        isActive: true,
        nextSequence: 4,
      },
    ])
    .onConflictDoNothing();

  const sampleTickets: Array<{
    id: string;
    organizationId: string;
    queueId: string;
    ticketCode: string;
    customerName: string;
    customerContact: string;
    subject: string;
    priority: TicketPriority;
    status: string;
    deskLabel: string | null;
    assignedUserId: string | null;
    offsetMinutes: number;
    slaBase: number;
  }> = [
    {
      id: "tkt_seed_dp_001",
      organizationId: "org_techlog_brasil",
      queueId: "que_techlog_docas",
      ticketCode: "DP-001",
      customerName: "Transportadora Atlântico",
      customerContact: "frota@atlanticolog.com.br",
      subject: "Conferência NF-e 88412 — Doca Refrigerada 03",
      priority: "HIGH",
      status: "IN_PROGRESS",
      deskLabel: "Guichê 01",
      assignedUserId: userIds["operador@pulsequeue.dev"] ?? null,
      offsetMinutes: -8,
      slaBase: 15,
    },
    {
      id: "tkt_seed_dp_002",
      organizationId: "org_techlog_brasil",
      queueId: "que_techlog_docas",
      ticketCode: "DP-002",
      customerName: "AgroSul Cargas Express",
      customerContact: "(11) 99412-8801",
      subject: "Divergência lacre térmico carga perecível",
      priority: "URGENT",
      status: "WAITING",
      deskLabel: null,
      assignedUserId: null,
      offsetMinutes: -4,
      slaBase: 15,
    },
    {
      id: "tkt_seed_dp_003",
      organizationId: "org_techlog_brasil",
      queueId: "que_techlog_docas",
      ticketCode: "DP-003",
      customerName: "Rodoviário Nacional",
      customerContact: "despacho@rodoviario.com.br",
      subject: "Liberação manifestação MDF-e lote Sul",
      priority: "NORMAL",
      status: "WAITING",
      deskLabel: null,
      assignedUserId: null,
      offsetMinutes: -3,
      slaBase: 15,
    },
    {
      id: "tkt_seed_n2_001",
      organizationId: "org_techlog_brasil",
      queueId: "que_techlog_suporte",
      ticketCode: "N2-001",
      customerName: "Operação Matriz SP",
      customerContact: "ti@techlog.com.br",
      subject: "Reprocessamento fila Webhook ERP TOTVS",
      priority: "HIGH",
      status: "WAITING",
      deskLabel: null,
      assignedUserId: null,
      offsetMinutes: -6,
      slaBase: 15,
    },
    {
      id: "tkt_seed_dp_004",
      organizationId: "org_techlog_brasil",
      queueId: "que_techlog_docas",
      ticketCode: "DP-004",
      customerName: "ViaExpresso Logística",
      customerContact: "(21) 98211-1020",
      subject: "Vistoria saída carreta 3 eixos",
      priority: "NORMAL",
      status: "COMPLETED",
      deskLabel: "Guichê 02",
      assignedUserId: userIds["admin@pulsequeue.dev"] ?? null,
      offsetMinutes: -22,
      slaBase: 15,
    },
    {
      id: "tkt_seed_tc_001",
      organizationId: "org_novacare_saude",
      queueId: "que_novacare_triagem",
      ticketCode: "TC-001",
      customerName: "Ana Beatriz Costa",
      customerContact: "(21) 98765-4321",
      subject: "Triagem Prioritária — Dor Torácica",
      priority: "URGENT",
      status: "IN_PROGRESS",
      deskLabel: "Consultório 02",
      assignedUserId: userIds["gestor@novacare.dev"] ?? null,
      offsetMinutes: -3,
      slaBase: 10,
    },
    {
      id: "tkt_seed_tc_002",
      organizationId: "org_novacare_saude",
      queueId: "que_novacare_triagem",
      ticketCode: "TC-002",
      customerName: "Carlos Eduardo Souza",
      customerContact: "carlos.souza@email.com",
      subject: "Retorno Ortopedia — Avaliação Exame",
      priority: "NORMAL",
      status: "WAITING",
      deskLabel: null,
      assignedUserId: null,
      offsetMinutes: -2,
      slaBase: 10,
    },
  ];

  for (const item of sampleTickets) {
    const createdAt = new Date(now.getTime() + item.offsetMinutes * 60_000);
    const slaDeadlineAt = calculateSlaDeadline(
      createdAt,
      item.slaBase,
      item.priority
    );

    await db
      .insert(tickets)
      .values({
        id: item.id,
        organizationId: item.organizationId,
        queueId: item.queueId,
        ticketCode: item.ticketCode,
        customerName: item.customerName,
        customerContact: item.customerContact,
        subject: item.subject,
        priority: item.priority,
        status: item.status,
        deskLabel: item.deskLabel,
        assignedUserId: item.assignedUserId,
        slaDeadlineAt,
        startedAt:
          item.status === "IN_PROGRESS" || item.status === "COMPLETED"
            ? new Date(createdAt.getTime() + 120_000)
            : null,
        completedAt:
          item.status === "COMPLETED"
            ? new Date(createdAt.getTime() + 480_000)
            : null,
        createdAt,
      })
      .onConflictDoNothing();
  }

  await db
    .insert(webhookEndpoints)
    .values([
      {
        id: "whk_techlog_internal",
        organizationId: "org_techlog_brasil",
        name: "Receptor Interno Auditado (HMAC-SHA256)",
        url: "internal://audit-sink",
        events: "*",
        isActive: true,
      },
      {
        id: "whk_novacare_internal",
        organizationId: "org_novacare_saude",
        name: "Barreira HL7 Interna (HMAC-SHA256)",
        url: "internal://audit-sink",
        events: "*",
        isActive: true,
      },
    ])
    .onConflictDoNothing();

  const initialPayload = {
    event: "ticket.created",
    ticketCode: "DP-002",
    customerName: "AgroSul Cargas Express",
    priority: "URGENT",
  };
  const initialSig = signWebhookPayload(
    JSON.stringify(initialPayload),
    "whsec_techlog_demo_8f31c9a2e4b7d601"
  );

  await db
    .insert(webhookDeliveries)
    .values({
      id: `del_${crypto.randomUUID()}`,
      organizationId: "org_techlog_brasil",
      direction: "OUTBOUND",
      eventType: "ticket.created",
      targetUrl: "internal://audit-sink",
      idempotencyKey: "seed-initial-dp-002",
      signatureHeader: initialSig,
      httpStatus: 200,
      status: "DELIVERED",
      responseSummary: "HMAC-SHA256 verificado na inicialização do workspace",
      payload: initialPayload,
    })
    .onConflictDoNothing();

  await db
    .insert(auditLogs)
    .values([
      {
        id: `aud_${crypto.randomUUID()}`,
        organizationId: "org_techlog_brasil",
        actorUserId: userIds["admin@pulsequeue.dev"] ?? null,
        actorEmail: "admin@pulsequeue.dev",
        action: "WORKSPACE_SEEDED",
        entityType: "organization",
        entityId: "org_techlog_brasil",
        metadata: {
          plan: "PRO",
          queuesCount: 2,
          slaTargetMinutes: 15,
        },
      },
      {
        id: `aud_${crypto.randomUUID()}`,
        organizationId: "org_novacare_saude",
        actorUserId: userIds["gestor@novacare.dev"] ?? null,
        actorEmail: "gestor@novacare.dev",
        action: "WORKSPACE_SEEDED",
        entityType: "organization",
        entityId: "org_novacare_saude",
        metadata: {
          plan: "ENTERPRISE",
          queuesCount: 1,
          slaTargetMinutes: 10,
        },
      },
    ])
    .onConflictDoNothing();
}
