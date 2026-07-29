import { describe, expect, it } from "vitest";
import {
  type EscrowDetailAnswers,
  validateEscrowDetailPrompt,
} from "@/lib/escrowWalkthrough";

const completeAnswers: EscrowDetailAnswers = {
  partyType: "individual",
  business: { legalName: "", representativeTitle: "" },
  counterpartyEmail: "seller@example.com",
  counterpartyEmailConfirmation: "seller@example.com",
  currentUserEmail: "buyer@example.com",
  title: "Website redesign",
  amount: "2500",
  description: "Design and deliver the approved website.",
  descriptionSkipped: false,
  fundingMode: "milestone",
};

describe("escrow detail walkthrough validation", () => {
  it("requires both business identity fields", () => {
    expect(
      validateEscrowDetailPrompt(1, {
        ...completeAnswers,
        partyType: "business",
        business: { legalName: "Northwind Ltd.", representativeTitle: "" },
      }),
    ).toBe("Enter your title at the business to continue.");
  });

  it("rejects an invalid or matching counterparty email", () => {
    expect(
      validateEscrowDetailPrompt(2, {
        ...completeAnswers,
        counterpartyEmail: "not-an-email",
      }),
    ).toBe("Enter a valid email address.");

    expect(
      validateEscrowDetailPrompt(2, {
        ...completeAnswers,
        counterpartyEmail: "BUYER@example.com",
      }),
    ).toBe("Use an email address other than your own.");
  });

  it("requires the counterparty email to be entered twice and match", () => {
    expect(
      validateEscrowDetailPrompt(2, {
        ...completeAnswers,
        counterpartyEmailConfirmation: "",
      }),
    ).toBe("Enter the counterparty's email again to confirm it.");

    expect(
      validateEscrowDetailPrompt(2, {
        ...completeAnswers,
        counterpartyEmailConfirmation: "another-seller@example.com",
      }),
    ).toBe("The email addresses do not match. Check both entries.");

    expect(
      validateEscrowDetailPrompt(2, {
        ...completeAnswers,
        counterpartyEmail: "SELLER@example.com ",
      }),
    ).toBeNull();
  });

  it("requires a title and a positive amount", () => {
    expect(validateEscrowDetailPrompt(3, { ...completeAnswers, title: " " })).toBe(
      "Give this escrow a clear name to continue.",
    );
    expect(validateEscrowDetailPrompt(4, { ...completeAnswers, amount: "0" })).toBe(
      "Enter an amount greater than $0.",
    );
  });

  it("only allows an empty scope after an explicit skip", () => {
    expect(
      validateEscrowDetailPrompt(5, {
        ...completeAnswers,
        description: "",
      }),
    ).toBe("Add a short scope or choose “Skip for now”.");

    expect(
      validateEscrowDetailPrompt(5, {
        ...completeAnswers,
        description: "",
        descriptionSkipped: true,
      }),
    ).toBeNull();
  });

  it("requires an agreed funding plan", () => {
    expect(
      validateEscrowDetailPrompt(6, {
        ...completeAnswers,
        fundingMode: null,
      }),
    ).toBe("Choose a funding plan to continue.");
    expect(validateEscrowDetailPrompt(6, completeAnswers)).toBeNull();
  });
});
