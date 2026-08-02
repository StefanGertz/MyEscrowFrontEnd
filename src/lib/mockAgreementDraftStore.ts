import type {
  EscrowCreationDraftData,
  EscrowCreationDraftServerState,
  StoredEscrowCreationDraft,
} from "@/lib/escrowCreationDraft";

type MockAgreementDraftEntry = EscrowCreationDraftServerState & {
  createdAt: string;
};

type MockAgreementDraftGlobal = typeof globalThis & {
  __myEscrowAgreementDrafts?: Map<string, MockAgreementDraftEntry>;
};

const globalStore = globalThis as MockAgreementDraftGlobal;
const agreementDrafts = globalStore.__myEscrowAgreementDrafts
  ?? new Map<string, MockAgreementDraftEntry>();
globalStore.__myEscrowAgreementDrafts = agreementDrafts;

export const mockAgreementDraftScope = (request: Request) =>
  request.headers.get("authorization") ?? "mock-customer";

export const getMockAgreementDraftState = (scope: string): EscrowCreationDraftServerState => {
  const entry = agreementDrafts.get(scope);
  return entry
    ? { draft: entry.draft, revision: entry.revision }
    : { draft: null, revision: 0 };
};

export const saveMockAgreementDraft = (
  scope: string,
  baseRevision: number,
  draft: EscrowCreationDraftData,
): EscrowCreationDraftServerState | null => {
  const current = agreementDrafts.get(scope);
  if ((current?.revision ?? 0) !== baseRevision) return null;

  const updatedAt = new Date().toISOString();
  const revision = baseRevision + 1;
  const savedDraft: StoredEscrowCreationDraft = {
    ...draft,
    createdAt: current?.createdAt ?? updatedAt,
    updatedAt,
    serverRevision: revision,
    hasLocalChanges: false,
  };
  agreementDrafts.set(scope, {
    draft: savedDraft,
    revision,
    createdAt: current?.createdAt ?? updatedAt,
  });
  return { draft: savedDraft, revision };
};

export const discardMockAgreementDraft = (
  scope: string,
  baseRevision: number,
): EscrowCreationDraftServerState | null => {
  const current = agreementDrafts.get(scope);
  if (!current) {
    if (baseRevision !== 0) return null;
    const createdAt = new Date().toISOString();
    agreementDrafts.set(scope, { draft: null, revision: 1, createdAt });
    return { draft: null, revision: 1 };
  }
  if (
    current.draft === null
    && (baseRevision === current.revision || baseRevision + 1 === current.revision)
  ) {
    return { draft: null, revision: current.revision };
  }
  if (baseRevision !== current.revision) return null;
  const revision = current.revision + 1;
  agreementDrafts.set(scope, { ...current, draft: null, revision });
  return { draft: null, revision };
};

export const consumeMockAgreementDraftForCreate = (
  scope: string,
  draftRevision: number | undefined,
): EscrowCreationDraftServerState | null => {
  const current = agreementDrafts.get(scope);
  if (!current) {
    if (draftRevision !== undefined && draftRevision !== 0) return null;
    const createdAt = new Date().toISOString();
    agreementDrafts.set(scope, { draft: null, revision: 1, createdAt });
    return { draft: null, revision: 1 };
  }
  if (draftRevision === undefined) {
    if (current.draft !== null) return null;
  } else if (draftRevision !== current.revision) {
    return null;
  }
  const revision = current.revision + 1;
  agreementDrafts.set(scope, { ...current, draft: null, revision });
  return { draft: null, revision };
};

export const resetMockAgreementDrafts = () => agreementDrafts.clear();
