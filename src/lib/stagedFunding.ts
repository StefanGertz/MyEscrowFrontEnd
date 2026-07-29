export type StagedFundingMilestone = {
  id: string;
  title: string;
  amountCents: number;
  fundedCents: number;
};

export type StagedFundingPreview = StagedFundingMilestone & {
  addedCents: number;
  resultingFundedCents: number;
  remainingCents: number;
  fundingStatus: "not_funded" | "partially_funded" | "funded";
};

export function previewStagedFunding(
  milestones: StagedFundingMilestone[],
  depositCents: number,
): StagedFundingPreview[] {
  let availableCents = Math.max(0, depositCents);

  return milestones.map((milestone) => {
    const currentFundedCents = Math.min(
      milestone.amountCents,
      Math.max(0, milestone.fundedCents),
    );
    const shortfallCents = milestone.amountCents - currentFundedCents;
    const addedCents = Math.min(shortfallCents, availableCents);
    availableCents -= addedCents;
    const resultingFundedCents = currentFundedCents + addedCents;
    const remainingCents = milestone.amountCents - resultingFundedCents;

    return {
      ...milestone,
      addedCents,
      resultingFundedCents,
      remainingCents,
      fundingStatus:
        remainingCents === 0
          ? "funded"
          : resultingFundedCents > 0
            ? "partially_funded"
            : "not_funded",
    };
  });
}
