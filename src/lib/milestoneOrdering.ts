type DeadlineItem = {
  deadline?: string | null;
};

export function sortByDeadline<T extends DeadlineItem>(items: T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const leftTime = left.item.deadline ? Date.parse(left.item.deadline) : Number.POSITIVE_INFINITY;
      const rightTime = right.item.deadline ? Date.parse(right.item.deadline) : Number.POSITIVE_INFINITY;
      const normalizedLeft = Number.isNaN(leftTime) ? Number.POSITIVE_INFINITY : leftTime;
      const normalizedRight = Number.isNaN(rightTime) ? Number.POSITIVE_INFINITY : rightTime;

      return normalizedLeft - normalizedRight || left.index - right.index;
    })
    .map(({ item }) => item);
}

export function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (
    fromIndex < 0 ||
    fromIndex >= items.length ||
    toIndex < 0 ||
    toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return items;
  }

  const reordered = [...items];
  const [item] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, item);
  return reordered;
}
