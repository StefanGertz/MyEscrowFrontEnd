export const customerScreenIds = [
  "welcome",
  "dashboard",
  "create",
  "milestones",
  "agreement",
  "wallet",
  "transactions",
  "history",
  "escrows",
  "settings",
  "transaction",
] as const;

export type CustomerScreenId = (typeof customerScreenIds)[number];

export type CustomerRoute = {
  screen: CustomerScreenId;
  transactionToken?: string;
};

export const isCustomerScreenId = (value: string | null | undefined): value is CustomerScreenId =>
  value !== null
  && value !== undefined
  && customerScreenIds.includes(value as CustomerScreenId);

export const resolveCustomerRoute = (
  screen: string | null | undefined,
  transactionToken?: string | null,
): CustomerRoute => ({
  screen: isCustomerScreenId(screen) ? screen : "welcome",
  transactionToken: transactionToken?.trim() || undefined,
});

export const parseCustomerRoute = (search: string): CustomerRoute => {
  const params = new URLSearchParams(search);
  return resolveCustomerRoute(params.get("screen"), params.get("tx"));
};

export const customerRouteHref = (
  screen: CustomerScreenId,
  transactionToken?: string | number | null,
) => {
  if (screen === "welcome") return "/";
  const params = new URLSearchParams({ screen });
  if (screen === "transaction" && transactionToken !== null && transactionToken !== undefined) {
    params.set("tx", String(transactionToken));
  }
  return `/?${params.toString()}`;
};
