import { describe, expect, it } from "vitest";
import {
  findTransactionByToken,
  transactionMatchesToken,
} from "@/lib/transactionRouting";

const transactions = [
  { id: 101, reference: "PO-00101", title: "First" },
  { id: 202, reference: "ESC-202", title: "Second" },
];

describe("transaction route restoration", () => {
  it("restores a transaction from its reference after data loads", () => {
    expect(findTransactionByToken([], "ESC-202")).toBeNull();
    expect(findTransactionByToken(transactions, "ESC-202")).toEqual(transactions[1]);
  });

  it("matches numeric route tokens to formatted references", () => {
    expect(transactionMatchesToken(transactions[0], "101")).toBe(true);
    expect(transactionMatchesToken(transactions[0], "PO-00101")).toBe(true);
    expect(transactionMatchesToken(transactions[0], "999")).toBe(false);
  });
});
