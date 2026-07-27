import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  notificationSeenStorageKey,
  useNotificationSeenToken,
} from "@/lib/notificationSeen";

beforeEach(() => {
  window.localStorage.clear();
});

describe("notification seen storage", () => {
  it("loads the active user's token and updates same-tab subscribers", () => {
    window.localStorage.setItem(notificationSeenStorageKey("user-1"), "saved-token");
    window.localStorage.setItem(notificationSeenStorageKey("user-2"), "other-token");

    const { result, rerender } = renderHook(
      ({ userId }) => useNotificationSeenToken(userId),
      { initialProps: { userId: "user-1" } },
    );

    expect(result.current.seenNotificationToken).toBe("saved-token");

    act(() => {
      result.current.saveNotificationSeenToken("new-token");
    });

    expect(result.current.seenNotificationToken).toBe("new-token");
    expect(window.localStorage.getItem(notificationSeenStorageKey("user-1"))).toBe("new-token");

    rerender({ userId: "user-2" });

    expect(result.current.seenNotificationToken).toBe("other-token");
  });
});
