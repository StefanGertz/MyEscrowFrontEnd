export function normalizeCurrencyInput(value: string): string {
  const cleaned = value.replace(/[^0-9.]/g, "");
  if (!cleaned) return "";

  const hasDecimal = cleaned.includes(".");
  const [wholePart = "", ...fractionParts] = cleaned.split(".");
  const whole = wholePart.replace(/^0+(?=\d)/, "") || "0";
  const fraction = fractionParts.join("").slice(0, 2);

  return hasDecimal ? `${whole}.${fraction}` : whole;
}

export function formatCurrencyInput(value: string): string {
  if (!value) return "";
  const [wholePart = "0", fraction] = value.split(".");
  const whole = Number(wholePart || "0").toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });
  return value.includes(".") ? `$${whole}.${fraction ?? ""}` : `$${whole}`;
}

export function formatCurrencyValue(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}
