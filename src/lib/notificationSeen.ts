import { useCallback, useSyncExternalStore } from "react";

type NotificationSeenInput = {
  id: string;
  createdAt?: string;
};

const notificationSeenChangeEvent = "myescrow:alerts-seen-change";
const getServerNotificationSeenToken = () => "";

export const latestNotificationSeenToken = (notifications: NotificationSeenInput[]) => {
  if (notifications.length === 0) return "";
  const [latest] = [...notifications].sort((left, right) => {
    const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : Number.NEGATIVE_INFINITY;
    const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : Number.NEGATIVE_INFINITY;
    const timeOrder =
      (Number.isFinite(rightTime) ? rightTime : Number.NEGATIVE_INFINITY) -
      (Number.isFinite(leftTime) ? leftTime : Number.NEGATIVE_INFINITY);
    return timeOrder || left.id.localeCompare(right.id);
  });
  return `${latest.createdAt ?? "no-date"}:${latest.id}`;
};

export const notificationSeenStorageKey = (userId: string) => `myescrow:alerts-seen:${userId}`;

export const useNotificationSeenToken = (userId: string) => {
  const storageKey = notificationSeenStorageKey(userId);
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const handleStorageChange = (event: StorageEvent) => {
        if (event.key === storageKey) {
          onStoreChange();
        }
      };
      const handleLocalChange = (event: Event) => {
        if (event instanceof CustomEvent && event.detail === storageKey) {
          onStoreChange();
        }
      };

      window.addEventListener("storage", handleStorageChange);
      window.addEventListener(notificationSeenChangeEvent, handleLocalChange);
      return () => {
        window.removeEventListener("storage", handleStorageChange);
        window.removeEventListener(notificationSeenChangeEvent, handleLocalChange);
      };
    },
    [storageKey],
  );
  const getSnapshot = useCallback(
    () => window.localStorage.getItem(storageKey) ?? "",
    [storageKey],
  );
  const seenNotificationToken = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerNotificationSeenToken,
  );
  const saveNotificationSeenToken = useCallback(
    (token: string) => {
      window.localStorage.setItem(storageKey, token);
      window.dispatchEvent(
        new CustomEvent(notificationSeenChangeEvent, { detail: storageKey }),
      );
    },
    [storageKey],
  );

  return { seenNotificationToken, saveNotificationSeenToken };
};
