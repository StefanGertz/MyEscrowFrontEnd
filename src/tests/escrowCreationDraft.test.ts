import { beforeEach, describe, expect, it } from "vitest";
import {
  ESCROW_CREATION_DRAFT_SCHEMA_VERSION,
  clearEscrowCreationDraftCache,
  clearEscrowCreationDraftConflictCache,
  createStoredEscrowCreationDraft,
  escrowCreationDraftStorageKey,
  readEscrowCreationDraftConflictCache,
  hasMeaningfulEscrowCreationDraft,
  newestEscrowCreationDraft,
  parseEscrowCreationDraftData,
  parseStoredEscrowCreationDraft,
  readEscrowCreationDraftCache,
  writeEscrowCreationDraftCache,
  writeEscrowCreationDraftConflictCache,
  type EscrowCreationDraftData,
  type StoredEscrowCreationDraft,
} from "@/lib/escrowCreationDraft";

const emptyDraft = (): EscrowCreationDraftData => ({
  schemaVersion: ESCROW_CREATION_DRAFT_SCHEMA_VERSION,
  screen: "create",
  createPromptStep: 0,
  descriptionSkipped: false,
  createForm: {
    role: "buyer",
    counterpartyEmail: "",
    counterpartyEmailConfirmation: "",
    title: "",
    amount: "",
    category: "Goods",
    description: "",
    fundingMode: null,
    partyType: "individual",
    business: {
      legalName: "",
      representativeTitle: "",
    },
  },
  milestones: [],
  milestoneInputs: {
    title: "",
    amount: "",
    description: "",
    deadline: "",
  },
  editingMilestoneId: null,
});

const populatedDraft = (): EscrowCreationDraftData => ({
  ...emptyDraft(),
  screen: "milestones",
  createPromptStep: 6,
  descriptionSkipped: true,
  createForm: {
    role: "seller",
    counterpartyEmail: "buyer@example.com",
    counterpartyEmailConfirmation: "buyer@example.com",
    title: "Website redesign",
    amount: "5000",
    category: "Services",
    description: "Design and build the new website.",
    fundingMode: "milestone",
    partyType: "business",
    business: {
      legalName: "Northwind Studio",
      representativeTitle: "Director",
    },
  },
  milestones: [
    {
      id: "milestone-1",
      title: "Design",
      amount: 2000,
      description: "Approved design files",
      deadline: "2026-09-01",
    },
  ],
  milestoneInputs: {
    title: "Build",
    amount: "3000",
    description: "In-progress milestone input",
    deadline: "2026-10-01",
  },
  editingMilestoneId: "milestone-2",
});

const storedDraft = (
  updatedAt = "2026-08-02T16:00:00.000Z",
): StoredEscrowCreationDraft => ({
  ...populatedDraft(),
  createdAt: "2026-08-02T15:00:00.000Z",
  updatedAt,
  serverRevision: 3,
  hasLocalChanges: false,
});

beforeEach(() => {
  window.localStorage.clear();
});

describe("escrow creation draft parsing", () => {
  it("round-trips every resumable wizard field and strips non-draft state", () => {
    const unsafeValue = {
      ...storedDraft(),
      agreementAccepted: true,
      signatureDataUrl: "data:image/png;base64,not-stored",
      createForm: {
        ...storedDraft().createForm,
        signatureDataUrl: "data:image/png;base64,also-not-stored",
      },
    };

    const parsed = parseStoredEscrowCreationDraft(JSON.stringify(unsafeValue));

    expect(parsed).toEqual(storedDraft());
    expect(parsed).not.toHaveProperty("agreementAccepted");
    expect(parsed).not.toHaveProperty("signatureDataUrl");
    expect(parsed?.createForm).not.toHaveProperty("signatureDataUrl");
  });

  it("rejects malformed, stale-version, and invalid wizard data", () => {
    expect(parseStoredEscrowCreationDraft("{not-json")).toBeNull();
    expect(parseStoredEscrowCreationDraft({ ...storedDraft(), schemaVersion: 2 })).toBeNull();
    expect(parseStoredEscrowCreationDraft({ ...storedDraft(), screen: "wallet" })).toBeNull();
    expect(parseStoredEscrowCreationDraft({ ...storedDraft(), createPromptStep: 7 })).toBeNull();
    expect(parseStoredEscrowCreationDraft({ ...storedDraft(), updatedAt: "not-a-date" })).toBeNull();
    expect(parseEscrowCreationDraftData({ ...populatedDraft(), milestones: [{ id: "bad" }] })).toBeNull();
    expect(parseEscrowCreationDraftData({
      ...populatedDraft(),
      createForm: { ...populatedDraft().createForm, amount: "12.345" },
    })).toBeNull();
    expect(parseEscrowCreationDraftData({
      ...populatedDraft(),
      milestones: [{ ...populatedDraft().milestones[0], amount: -1 }],
    })).toBeNull();
    expect(parseEscrowCreationDraftData({
      ...populatedDraft(),
      milestones: [{
        ...populatedDraft().milestones[0],
        amount: Number.MAX_SAFE_INTEGER / 100 + 1,
      }],
    })).toBeNull();
  });
});

describe("escrow creation draft cache", () => {
  it("stores drafts per user and clears only the requested user's draft", () => {
    const saved = writeEscrowCreationDraftCache("user/one", storedDraft());

    expect(saved).toEqual(storedDraft());
    expect(readEscrowCreationDraftCache("user/one")).toEqual(storedDraft());
    expect(readEscrowCreationDraftCache("user-two")).toBeNull();
    expect(window.localStorage.getItem(escrowCreationDraftStorageKey("user/one"))).not.toBeNull();

    writeEscrowCreationDraftCache("user-two", {
      ...storedDraft(),
      updatedAt: "2026-08-02T17:00:00.000Z",
    });
    expect(clearEscrowCreationDraftCache("user/one")).toBe(true);
    expect(readEscrowCreationDraftCache("user/one")).toBeNull();
    expect(readEscrowCreationDraftCache("user-two")).not.toBeNull();
  });

  it("adds timestamps to an immediate local snapshot and preserves its creation time", () => {
    const first = createStoredEscrowCreationDraft(
      populatedDraft(),
      null,
      "2026-08-02T15:00:00.000Z",
    );
    const second = createStoredEscrowCreationDraft(
      { ...populatedDraft(), screen: "agreement" },
      first,
      "2026-08-02T15:05:00.000Z",
    );

    expect(first?.createdAt).toBe("2026-08-02T15:00:00.000Z");
    expect(second?.createdAt).toBe(first?.createdAt);
    expect(second?.updatedAt).toBe("2026-08-02T15:05:00.000Z");
    expect(second?.screen).toBe("agreement");
    expect(second?.serverRevision).toBe(0);
    expect(second?.hasLocalChanges).toBe(true);

    const clockSkewedUpdate = createStoredEscrowCreationDraft(
      populatedDraft(),
      second,
      "2026-08-02T14:00:00.000Z",
    );
    expect(Date.parse(clockSkewedUpdate?.updatedAt ?? "")).toBe(
      Date.parse(second?.updatedAt ?? "") + 1,
    );
  });

  it("seeds a new local draft from the current server tombstone revision", () => {
    const saved = writeEscrowCreationDraftCache(
      "user-one",
      populatedDraft(),
      undefined,
      7,
    );

    expect(saved?.serverRevision).toBe(7);
    expect(saved?.hasLocalChanges).toBe(true);
    expect(readEscrowCreationDraftCache("user-one")?.serverRevision).toBe(7);
  });

  it("keeps a conflicting local copy durable until it is explicitly cleared", () => {
    const conflict = { ...storedDraft(), hasLocalChanges: true };

    expect(writeEscrowCreationDraftConflictCache("user-one", conflict)).toBe(true);
    expect(readEscrowCreationDraftConflictCache("user-one")).toEqual(conflict);
    expect(clearEscrowCreationDraftConflictCache("user-one")).toBe(true);
    expect(readEscrowCreationDraftConflictCache("user-one")).toBeNull();
  });

  it("fails closed when browser storage is unavailable", () => {
    const unavailableStorage = {
      getItem: () => {
        throw new Error("unavailable");
      },
      setItem: () => {
        throw new Error("quota exceeded");
      },
      removeItem: () => {
        throw new Error("unavailable");
      },
    };

    expect(readEscrowCreationDraftCache("user-one", unavailableStorage)).toBeNull();
    expect(writeEscrowCreationDraftCache("user-one", storedDraft(), unavailableStorage)).toBeNull();
    expect(clearEscrowCreationDraftCache("user-one", unavailableStorage)).toBe(false);
  });
});

describe("escrow creation draft reconciliation", () => {
  it("selects the newest copy and treats the server as canonical on a timestamp tie", () => {
    const olderLocal = storedDraft("2026-08-02T16:00:00.000Z");
    const newerServer = storedDraft("2026-08-02T17:00:00.000Z");
    expect(newestEscrowCreationDraft(olderLocal, newerServer)).toBe(newerServer);

    const newerLocal = storedDraft("2026-08-02T18:00:00.000Z");
    expect(newestEscrowCreationDraft(newerLocal, newerServer)).toBe(newerLocal);
    expect(newestEscrowCreationDraft(newerServer, newerServer)).toBe(newerServer);
    expect(newestEscrowCreationDraft(null, newerServer)).toBe(newerServer);
    expect(newestEscrowCreationDraft(newerLocal, null)).toBe(newerLocal);
  });

  it("distinguishes an untouched form from partial progress", () => {
    expect(hasMeaningfulEscrowCreationDraft(emptyDraft())).toBe(false);
    expect(hasMeaningfulEscrowCreationDraft({
      ...emptyDraft(),
      milestoneInputs: { ...emptyDraft().milestoneInputs, title: "Partial milestone" },
    })).toBe(true);
  });
});
