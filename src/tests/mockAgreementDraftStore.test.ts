import { beforeEach, describe, expect, it } from "vitest";
import {
  consumeMockAgreementDraftForCreate,
  discardMockAgreementDraft,
  getMockAgreementDraftState,
  resetMockAgreementDrafts,
  saveMockAgreementDraft,
} from "@/lib/mockAgreementDraftStore";
import {
  ESCROW_CREATION_DRAFT_SCHEMA_VERSION,
  type EscrowCreationDraftData,
} from "@/lib/escrowCreationDraft";

const draft = (title: string): EscrowCreationDraftData => ({
  schemaVersion: ESCROW_CREATION_DRAFT_SCHEMA_VERSION,
  screen: "create",
  createPromptStep: 3,
  descriptionSkipped: false,
  createForm: {
    role: "buyer",
    counterpartyEmail: "seller@example.com",
    counterpartyEmailConfirmation: "seller@example.com",
    title,
    amount: "1000",
    category: "Services",
    description: "",
    fundingMode: "full",
    partyType: "individual",
    business: { legalName: "", representativeTitle: "" },
  },
  milestones: [],
  milestoneInputs: { title: "", amount: "", description: "", deadline: "" },
  editingMilestoneId: null,
});

beforeEach(() => resetMockAgreementDrafts());

describe("mock agreement draft store", () => {
  it("isolates drafts by authenticated user scope", () => {
    expect(saveMockAgreementDraft("Bearer mock-token:user-a", 0, draft("User A"))).not.toBeNull();

    expect(getMockAgreementDraftState("Bearer mock-token:user-a").draft?.createForm.title).toBe("User A");
    expect(getMockAgreementDraftState("Bearer mock-token:user-b")).toEqual({
      draft: null,
      revision: 0,
    });
  });

  it("tombstones a consumed draft and rejects delayed stale saves", () => {
    const saved = saveMockAgreementDraft("user-a", 0, draft("Ready to submit"));
    expect(saved?.revision).toBe(1);

    const consumed = consumeMockAgreementDraftForCreate("user-a", saved?.revision);
    expect(consumed).toEqual({ draft: null, revision: 2 });
    expect(saveMockAgreementDraft("user-a", 1, draft("Stale tab"))).toBeNull();
    expect(getMockAgreementDraftState("user-a")).toEqual({ draft: null, revision: 2 });
  });

  it("rejects stale final creation and preserves a newer active draft", () => {
    const first = saveMockAgreementDraft("user-a", 0, draft("First"));
    const newer = saveMockAgreementDraft("user-a", first?.revision ?? -1, draft("Newer"));

    expect(consumeMockAgreementDraftForCreate("user-a", first?.revision)).toBeNull();
    expect(getMockAgreementDraftState("user-a").draft?.createForm.title).toBe("Newer");
    expect(getMockAgreementDraftState("user-a").revision).toBe(newer?.revision);
  });

  it("creates a tombstone for an empty discard so base-zero saves cannot resurrect it", () => {
    expect(discardMockAgreementDraft("user-a", 0)).toEqual({ draft: null, revision: 1 });
    expect(discardMockAgreementDraft("user-a", 0)).toEqual({ draft: null, revision: 1 });
    expect(saveMockAgreementDraft("user-a", 0, draft("Delayed"))).toBeNull();
  });
});
