type NotificationSeenInput = {
  id: string;
  createdAt?: string;
};

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
