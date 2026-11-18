export const TICKET_PRIORITIES = ["URGENT", "HIGH", "NORMAL"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_STATUSES = [
  "WAITING",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export type SlaHealth = "HEALTHY" | "WARNING" | "BREACHED";

const PRIORITY_WEIGHT: Record<TicketPriority, number> = {
  URGENT: 3,
  HIGH: 2,
  NORMAL: 1,
};

const PRIORITY_SLA_MULTIPLIER: Record<TicketPriority, number> = {
  URGENT: 0.35,
  HIGH: 0.65,
  NORMAL: 1.0,
};

const ALLOWED_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  WAITING: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "WAITING", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

/**
 * Validates whether a queue ticket status transition follows the allowed state machine.
 */
export function canTransitionTicketStatus(
  from: TicketStatus,
  to: TicketStatus
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * Computes the SLA deadline timestamp from organization base SLA and ticket priority.
 */
export function calculateSlaDeadline(
  createdAt: Date,
  orgSlaMinutes: number,
  priority: TicketPriority
): Date {
  const safeBaseMinutes = Math.max(3, orgSlaMinutes);
  const targetMinutes = Math.max(
    2,
    Math.round(safeBaseMinutes * PRIORITY_SLA_MULTIPLIER[priority])
  );
  return new Date(createdAt.getTime() + targetMinutes * 60_000);
}

/**
 * Evaluates current SLA health for a ticket at a given reference timestamp.
 */
export function evaluateSlaHealth(
  createdAt: Date,
  slaDeadlineAt: Date,
  status: TicketStatus,
  now: Date = new Date()
): SlaHealth {
  if (status === "COMPLETED" || status === "CANCELLED") {
    return "HEALTHY";
  }

  const totalWindowMs = Math.max(1, slaDeadlineAt.getTime() - createdAt.getTime());
  const remainingMs = slaDeadlineAt.getTime() - now.getTime();

  if (remainingMs <= 0) {
    return "BREACHED";
  }

  if (remainingMs / totalWindowMs <= 0.3) {
    return "WARNING";
  }

  return "HEALTHY";
}

export interface PrioritizableTicket {
  priority: TicketPriority;
  slaDeadlineAt: Date;
  createdAt: Date;
}

/**
 * Orders waiting queue tickets by priority first (URGENT > HIGH > NORMAL),
 * then earliest SLA deadline, then oldest creation timestamp (FIFO tiebreaker).
 */
export function compareQueueTickets(
  a: PrioritizableTicket,
  b: PrioritizableTicket
): number {
  const priorityDiff = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
  if (priorityDiff !== 0) return priorityDiff;

  const deadlineDiff = a.slaDeadlineAt.getTime() - b.slaDeadlineAt.getTime();
  if (deadlineDiff !== 0) return deadlineDiff;

  return a.createdAt.getTime() - b.createdAt.getTime();
}

/**
 * Formats a zero-padded ticket display code like `PR-004` from queue prefix and sequence.
 */
export function formatTicketCode(prefix: string, sequenceNumber: number): string {
  const cleanPrefix = prefix.trim().toUpperCase().slice(0, 4) || "PQ";
  return `${cleanPrefix}-${String(sequenceNumber).padStart(3, "0")}`;
}
