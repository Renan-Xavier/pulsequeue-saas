import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  plan: text("plan").notNull().default("PRO"),
  slaTargetMinutes: integer("sla_target_minutes").notNull().default(15),
  webhookSecret: text("webhook_secret").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("OPERATOR"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("memberships_user_org_idx").on(
      table.userId,
      table.organizationId
    ),
  ]
);

export const queues = pgTable("queues", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(),
  description: text("description").notNull().default(""),
  isActive: boolean("is_active").notNull().default(true),
  nextSequence: integer("next_sequence").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const tickets = pgTable("tickets", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  queueId: text("queue_id")
    .notNull()
    .references(() => queues.id, { onDelete: "cascade" }),
  ticketCode: text("ticket_code").notNull(),
  customerName: text("customer_name").notNull(),
  customerContact: text("customer_contact").notNull().default(""),
  subject: text("subject").notNull(),
  priority: text("priority").notNull().default("NORMAL"),
  status: text("status").notNull().default("WAITING"),
  deskLabel: text("desk_label"),
  assignedUserId: text("assigned_user_id").references(() => user.id, {
    onDelete: "set null",
  }),
  slaDeadlineAt: timestamp("sla_deadline_at", { withTimezone: true }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const webhookEndpoints = pgTable("webhook_endpoints", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  url: text("url").notNull(),
  events: text("events")
    .notNull()
    .default("ticket.created,ticket.called,ticket.completed"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const outboxJobs = pgTable(
  "outbox_jobs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(4),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastError: text("last_error"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("outbox_org_idempotency_idx").on(
      table.organizationId,
      table.idempotencyKey
    ),
  ]
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    direction: text("direction").notNull(),
    eventType: text("event_type").notNull(),
    targetUrl: text("target_url").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    signatureHeader: text("signature_header").notNull(),
    httpStatus: integer("http_status").notNull(),
    status: text("status").notNull(),
    responseSummary: text("response_summary").notNull().default(""),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("deliveries_org_dir_idempotency_idx").on(
      table.organizationId,
      table.direction,
      table.idempotencyKey
    ),
  ]
);

export const auditLogs = pgTable("audit_logs", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  actorUserId: text("actor_user_id").references(() => user.id, {
    onDelete: "set null",
  }),
  actorEmail: text("actor_email")
    .notNull()
    .default("system@pulsequeue.dev"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
