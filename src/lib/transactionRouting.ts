type TransactionRouteItem = {
  id: string | number;
  reference?: string | null;
};

const normalizeTransactionToken = (value: string | number | undefined | null) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const digits = text.replace(/[^0-9]/g, "");
  return {
    raw: text,
    digits: digits ? String(Number(digits)) : null,
  };
};

export const transactionMatchesToken = (
  transaction: TransactionRouteItem,
  value: string | number | undefined | null,
) => {
  const token = normalizeTransactionToken(value);
  if (!token) return false;
  if (String(transaction.id) === token.raw) return true;
  if (transaction.reference && transaction.reference === token.raw) return true;
  const referenceDigits = transaction.reference
    ? normalizeTransactionToken(transaction.reference)?.digits
    : null;
  return Boolean(token.digits && referenceDigits && token.digits === referenceDigits);
};

export const findTransactionByToken = <Transaction extends TransactionRouteItem>(
  transactions: Transaction[],
  value: string | number | undefined | null,
) => transactions.find((transaction) => transactionMatchesToken(transaction, value)) ?? null;
