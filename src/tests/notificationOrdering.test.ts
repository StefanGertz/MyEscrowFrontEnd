import { describe, expect, it } from "vitest";
import { orderNotifications } from "@/lib/notificationOrdering";

describe("orderNotifications", () => {
  it("orders notifications by newest creation time first", () => {
    const ordered = orderNotifications([
      { id: "old-action", createdAt: "2026-07-09T10:00:00.000Z", requiresAction: true },
      { id: "new-info", createdAt: "2026-07-09T12:00:00.000Z", requiresAction: false },
      { id: "middle", createdAt: "2026-07-09T11:00:00.000Z", requiresAction: false },
    ]);

    expect(ordered.map((notification) => notification.id)).toEqual(["new-info", "middle", "old-action"]);
  });

  it("uses action required as a tie-breaker when timestamps match", () => {
    const ordered = orderNotifications(
      [
        { id: "info", createdAt: "2026-07-09T12:00:00.000Z", requiresAction: false },
        { id: "action", createdAt: "2026-07-09T12:00:00.000Z", requiresAction: true },
      ],
      (notification) => notification.requiresAction,
    );

    expect(ordered.map((notification) => notification.id)).toEqual(["action", "info"]);
  });
});
