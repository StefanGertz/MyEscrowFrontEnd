import { describe, expect, it } from "vitest";
import {
  parseArchivedTransactionTokens,
  updateArchivedTransactionTokens,
} from "@/lib/transactionArchive";

describe("transaction archive preferences", () => {
  it("parses valid unique archive tokens and ignores invalid storage", () => {
    expect(parseArchivedTransactionTokens('[\"PO-1\",\"PO-1\",\"PO-2\",null]')).toEqual(["PO-1", "PO-2"]);
    expect(parseArchivedTransactionTokens("{not-json")).toEqual([]);
  });

  it("archives and restores a transaction token", () => {
    const archived = updateArchivedTransactionTokens([], "PO-10", true);
    expect(archived).toEqual(["PO-10"]);
    expect(updateArchivedTransactionTokens(archived, "PO-10", false)).toEqual([]);
  });
});
