import { describe, expect, it } from "vitest";
import {
  calculateSlaDeadline,
  canTransitionTicketStatus,
  compareQueueTickets,
  evaluateSlaHealth,
  formatTicketCode,
} from "@/server/queues/sla";

describe("Queue SLA & State Machine Domain Rules", () => {
  it("enforces valid ticket status transitions", () => {
    expect(canTransitionTicketStatus("WAITING", "IN_PROGRESS")).toBe(true);
    expect(canTransitionTicketStatus("WAITING", "CANCELLED")).toBe(true);
    expect(canTransitionTicketStatus("WAITING", "COMPLETED")).toBe(false);
    expect(canTransitionTicketStatus("IN_PROGRESS", "COMPLETED")).toBe(true);
    expect(canTransitionTicketStatus("IN_PROGRESS", "WAITING")).toBe(true);
    expect(canTransitionTicketStatus("COMPLETED", "WAITING")).toBe(false);
    expect(canTransitionTicketStatus("CANCELLED", "IN_PROGRESS")).toBe(false);
  });

  it("tightens SLA window for URGENT and HIGH priorities", () => {
    const base = new Date("2026-11-17T12:00:00Z");
    const normal = calculateSlaDeadline(base, 20, "NORMAL");
    const high = calculateSlaDeadline(base, 20, "HIGH");
    const urgent = calculateSlaDeadline(base, 20, "URGENT");

    expect(normal.getTime() - base.getTime()).toBe(20 * 60_000);
    expect(high.getTime() - base.getTime()).toBe(13 * 60_000);
    expect(urgent.getTime() - base.getTime()).toBe(7 * 60_000);
  });

  it("evaluates SLA health thresholds (HEALTHY / WARNING / BREACHED)", () => {
    const createdAt = new Date("2026-11-17T12:00:00Z");
    const deadline = new Date("2026-11-17T12:20:00Z");

    expect(
      evaluateSlaHealth(
        createdAt,
        deadline,
        "WAITING",
        new Date("2026-11-17T12:05:00Z")
      )
    ).toBe("HEALTHY");

    expect(
      evaluateSlaHealth(
        createdAt,
        deadline,
        "WAITING",
        new Date("2026-11-17T12:16:00Z")
      )
    ).toBe("WARNING");

    expect(
      evaluateSlaHealth(
        createdAt,
        deadline,
        "WAITING",
        new Date("2026-11-17T12:21:00Z")
      )
    ).toBe("BREACHED");

    expect(
      evaluateSlaHealth(
        createdAt,
        deadline,
        "COMPLETED",
        new Date("2026-11-17T13:00:00Z")
      )
    ).toBe("HEALTHY");
  });

  it("prioritizes URGENT > HIGH > NORMAL and earlier SLA deadline", () => {
    const base = new Date("2026-11-17T12:00:00Z");
    const tickets = [
      {
        priority: "NORMAL" as const,
        createdAt: new Date(base.getTime()),
        slaDeadlineAt: new Date(base.getTime() + 10 * 60_000),
      },
      {
        priority: "URGENT" as const,
        createdAt: new Date(base.getTime() + 5 * 60_000),
        slaDeadlineAt: new Date(base.getTime() + 12 * 60_000),
      },
      {
        priority: "HIGH" as const,
        createdAt: new Date(base.getTime() + 2 * 60_000),
        slaDeadlineAt: new Date(base.getTime() + 8 * 60_000),
      },
    ];

    const sorted = [...tickets].sort(compareQueueTickets);
    expect(sorted.map((t) => t.priority)).toEqual(["URGENT", "HIGH", "NORMAL"]);
  });

  it("formats zero-padded ticket codes safely", () => {
    expect(formatTicketCode("pr", 7)).toBe("PR-007");
    expect(formatTicketCode("n2", 124)).toBe("N2-124");
  });
});
