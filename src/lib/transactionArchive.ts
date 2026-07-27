export const parseArchivedTransactionTokens = (storedValue: string | null): string[] => {
  if (!storedValue) return [];
  try {
    const parsed = JSON.parse(storedValue);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((value): value is string => typeof value === "string" && value.trim() !== ""))];
  } catch {
    return [];
  }
};

export const updateArchivedTransactionTokens = (
  current: string[],
  token: string,
  archived: boolean,
) => {
  const next = new Set(current);
  if (archived) {
    next.add(token);
  } else {
    next.delete(token);
  }
  return [...next];
};
