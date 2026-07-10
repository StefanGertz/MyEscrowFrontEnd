type NotificationOrderInput = {
  id: string;
  createdAt?: string;
};

const notificationTimestamp = (createdAt?: string) => {
  if (!createdAt) return Number.NEGATIVE_INFINITY;
  const timestamp = new Date(createdAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
};

export const orderNotifications = <T extends NotificationOrderInput>(
  notifications: T[],
  requiresAction: (notification: T) => boolean = () => false,
) =>
  [...notifications].sort((left, right) => {
    const newestFirst = notificationTimestamp(right.createdAt) - notificationTimestamp(left.createdAt);
    if (newestFirst !== 0) return newestFirst;

    const actionFirst = Number(requiresAction(right)) - Number(requiresAction(left));
    if (actionFirst !== 0) return actionFirst;

    return left.id.localeCompare(right.id);
  });
