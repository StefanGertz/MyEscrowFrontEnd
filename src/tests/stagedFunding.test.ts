import { describe, expect, it } from "vitest";
import { previewStagedFunding } from "@/lib/stagedFunding";

describe("staged funding preview", () => {
  it("shows how a deposit completes and partially funds consecutive milestones", () => {
    expect(previewStagedFunding([
      {
        id: "2",
        title: "Milestone 2",
        amountCents: 50_000,
        fundedCents: 0,
      },
      {
        id: "3",
        title: "Milestone 3",
        amountCents: 100_000,
        fundedCents: 0,
      },
    ], 100_000)).toEqual([
      expect.objectContaining({
        id: "2",
        addedCents: 50_000,
        resultingFundedCents: 50_000,
        remainingCents: 0,
        fundingStatus: "funded",
      }),
      expect.objectContaining({
        id: "3",
        addedCents: 50_000,
        resultingFundedCents: 50_000,
        remainingCents: 50_000,
        fundingStatus: "partially_funded",
      }),
    ]);
  });
});
