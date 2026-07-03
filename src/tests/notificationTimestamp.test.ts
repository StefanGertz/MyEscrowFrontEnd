import { describe, expect, it } from "vitest";
import { formatNotificationTimestamp } from "@/components/NotificationTimestamp";

const now = new Date("2026-07-03T16:00:00.000Z").getTime();

describe("formatNotificationTimestamp", () => {
  it("formats notification age from its creation timestamp", () => {
    expect(formatNotificationTimestamp("2026-07-03T15:59:30.000Z", now)).toBe("Just now");
    expect(formatNotificationTimestamp("2026-07-03T15:42:00.000Z", now)).toBe("18m ago");
    expect(formatNotificationTimestamp("2026-07-03T13:00:00.000Z", now)).toBe("3h ago");
    expect(formatNotificationTimestamp("2026-07-01T16:00:00.000Z", now)).toBe("2d ago");
  });
});
