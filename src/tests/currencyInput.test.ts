import { describe, expect, it } from "vitest";
import { formatCurrencyInput, formatCurrencyValue, normalizeCurrencyInput } from "@/lib/currencyInput";

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

  it("reformats the displayed value after every keystroke", () => {
    const displayedValues = ["1", "$10", "$100", "$1000"].map((typedValue) =>
      formatCurrencyInput(normalizeCurrencyInput(typedValue)),
    );

    expect(displayedValues).toEqual(["$1", "$10", "$100", "$1,000"]);
  });

  it("preserves cents in displayed monetary values", () => {
    expect(formatCurrencyValue(1200)).toBe("$1,200.00");
    expect(formatCurrencyValue(1200.5)).toBe("$1,200.50");
    expect(formatCurrencyValue(1200.99)).toBe("$1,200.99");
  });
});
