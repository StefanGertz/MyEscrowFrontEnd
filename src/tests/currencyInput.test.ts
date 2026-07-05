import { describe, expect, it } from "vitest";
import { formatCurrencyInput, normalizeCurrencyInput } from "@/lib/currencyInput";

describe("escrow currency input", () => {
  it("adds a dollar sign and thousands separators", () => {
    expect(formatCurrencyInput("1000")).toBe("$1,000");
    expect(formatCurrencyInput("12500.50")).toBe("$12,500.50");
  });

  it("normalizes typed and pasted currency without losing decimal entry", () => {
    expect(normalizeCurrencyInput("$12,345.67")).toBe("12345.67");
    expect(normalizeCurrencyInput("1,000.")).toBe("1000.");
    expect(normalizeCurrencyInput("")).toBe("");
  });
});
