export const ESCROW_CREATION_DRAFT_SCHEMA_VERSION = 1 as const;

export type EscrowCreationDraftScreen = "create" | "milestones" | "agreement";

export type EscrowCreationDraftForm = {
  role: "buyer" | "seller";
  counterpartyEmail: string;
  counterpartyEmailConfirmation: string;
  title: string;
  amount: string;
  category: string;
  description: string;
  fundingMode: "full" | "milestone" | null;
  partyType: "individual" | "business";
  business: {
    legalName: string;
    representativeTitle: string;
  };
};

export type EscrowCreationDraftMilestone = {
  id: string;
  title: string;
  amount: number;
  description: string;
  deadline: string;
};

export type EscrowCreationDraftMilestoneInputs = {
  title: string;
  amount: string;
  description: string;
  deadline: string;
};

export type EscrowCreationDraftData = {
  schemaVersion: typeof ESCROW_CREATION_DRAFT_SCHEMA_VERSION;
  screen: EscrowCreationDraftScreen;
  createPromptStep: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  descriptionSkipped: boolean;
  createForm: EscrowCreationDraftForm;
  milestones: EscrowCreationDraftMilestone[];
  milestoneInputs: EscrowCreationDraftMilestoneInputs;
  editingMilestoneId: string | null;
};

export type StoredEscrowCreationDraft = EscrowCreationDraftData & {
  createdAt: string;
  updatedAt: string;
  serverRevision: number;
  hasLocalChanges: boolean;
};

export type EscrowCreationDraftServerState = {
  draft: StoredEscrowCreationDraft | null;
  revision: number;
};

type StorageAdapter = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const draftScreens = new Set<EscrowCreationDraftScreen>([
  "create",
  "milestones",
  "agreement",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === "string";

const isNonEmptyString = (value: unknown): value is string =>
  isString(value) && value.trim().length > 0;

const isBoundedString = (value: unknown, maximumLength: number): value is string =>
  isString(value) && value.length <= maximumLength;

const draftCurrencyPattern = /^(?:\d+(?:\.\d{0,2})?)?$/;
const draftDatePattern = /^(?:|\d{4}-\d{2}-\d{2})$/;
const maximumExactDollarAmount = Number.MAX_SAFE_INTEGER / 100;

const isDraftCurrency = (value: unknown): value is string =>
  isBoundedString(value, 32) && draftCurrencyPattern.test(value);

const isDraftDate = (value: unknown): value is string =>
  isBoundedString(value, 10) && draftDatePattern.test(value);

const isTimestamp = (value: unknown): value is string =>
  isString(value) && Number.isFinite(Date.parse(value));

const parseCreationForm = (value: unknown): EscrowCreationDraftForm | null => {
  if (!isRecord(value) || !isRecord(value.business)) return null;
  if (value.role !== "buyer" && value.role !== "seller") return null;
  if (value.partyType !== "individual" && value.partyType !== "business") return null;
  if (value.fundingMode !== null && value.fundingMode !== "full" && value.fundingMode !== "milestone") {
    return null;
  }

  if (!isBoundedString(value.counterpartyEmail, 320)) return null;
  if (!isBoundedString(value.counterpartyEmailConfirmation, 320)) return null;
  if (!isBoundedString(value.title, 200)) return null;
  if (!isDraftCurrency(value.amount)) return null;
  if (!isBoundedString(value.category, 100)) return null;
  if (!isBoundedString(value.description, 10_000)) return null;
  if (!isBoundedString(value.business.legalName, 200)) return null;
  if (!isBoundedString(value.business.representativeTitle, 200)) return null;

  return {
    role: value.role,
    counterpartyEmail: value.counterpartyEmail as string,
    counterpartyEmailConfirmation: value.counterpartyEmailConfirmation as string,
    title: value.title as string,
    amount: value.amount as string,
    category: value.category as string,
    description: value.description as string,
    fundingMode: value.fundingMode,
    partyType: value.partyType,
    business: {
      legalName: value.business.legalName as string,
      representativeTitle: value.business.representativeTitle as string,
    },
  };
};

const parseMilestone = (value: unknown): EscrowCreationDraftMilestone | null => {
  if (!isRecord(value)) return null;
  if (!isNonEmptyString(value.id) || value.id.length > 100) return null;
  if (
    typeof value.amount !== "number"
    || !Number.isFinite(value.amount)
    || value.amount < 0
    || value.amount > maximumExactDollarAmount
  ) {
    return null;
  }
  if (!isBoundedString(value.title, 200)) return null;
  if (!isBoundedString(value.description, 5_000)) return null;
  if (!isDraftDate(value.deadline)) return null;
  return {
    id: value.id,
    title: value.title as string,
    amount: value.amount,
    description: value.description as string,
    deadline: value.deadline as string,
  };
};

const parseMilestoneInputs = (value: unknown): EscrowCreationDraftMilestoneInputs | null => {
  if (!isRecord(value)) return null;
  if (!isBoundedString(value.title, 200)) return null;
  if (!isDraftCurrency(value.amount)) return null;
  if (!isBoundedString(value.description, 5_000)) return null;
  if (!isDraftDate(value.deadline)) return null;
  return {
    title: value.title as string,
    amount: value.amount as string,
    description: value.description as string,
    deadline: value.deadline as string,
  };
};

export const parseEscrowCreationDraftData = (
  value: unknown,
): EscrowCreationDraftData | null => {
  if (!isRecord(value)) return null;
  if (value.schemaVersion !== ESCROW_CREATION_DRAFT_SCHEMA_VERSION) return null;
  if (!isString(value.screen) || !draftScreens.has(value.screen as EscrowCreationDraftScreen)) {
    return null;
  }
  if (
    !Number.isInteger(value.createPromptStep)
    || (value.createPromptStep as number) < 0
    || (value.createPromptStep as number) > 6
  ) {
    return null;
  }
  if (typeof value.descriptionSkipped !== "boolean") return null;
  if (!Array.isArray(value.milestones) || value.milestones.length > 100) return null;
  if (
    value.editingMilestoneId !== null
    && (!isNonEmptyString(value.editingMilestoneId) || value.editingMilestoneId.length > 100)
  ) {
    return null;
  }

  const createForm = parseCreationForm(value.createForm);
  const milestones = value.milestones.map(parseMilestone);
  const milestoneInputs = parseMilestoneInputs(value.milestoneInputs);
  if (!createForm || !milestoneInputs || milestones.some((milestone) => milestone === null)) {
    return null;
  }

  return {
    schemaVersion: ESCROW_CREATION_DRAFT_SCHEMA_VERSION,
    screen: value.screen as EscrowCreationDraftScreen,
    createPromptStep: value.createPromptStep as EscrowCreationDraftData["createPromptStep"],
    descriptionSkipped: value.descriptionSkipped,
    createForm,
    milestones: milestones as EscrowCreationDraftMilestone[],
    milestoneInputs,
    editingMilestoneId: value.editingMilestoneId,
  };
};

export const parseStoredEscrowCreationDraft = (
  value: unknown,
  serverRevisionOverride?: number,
): StoredEscrowCreationDraft | null => {
  let parsedValue = value;
  if (typeof value === "string") {
    try {
      parsedValue = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  if (!isRecord(parsedValue)) return null;
  const draft = parseEscrowCreationDraftData(parsedValue);
  const serverRevision = serverRevisionOverride ?? parsedValue.serverRevision ?? 0;
  const hasLocalChanges = serverRevisionOverride === undefined
    ? parsedValue.hasLocalChanges ?? false
    : false;
  if (!draft || !isTimestamp(parsedValue.createdAt) || !isTimestamp(parsedValue.updatedAt)) {
    return null;
  }
  if (!Number.isSafeInteger(serverRevision) || (serverRevision as number) < 0) return null;
  if (typeof hasLocalChanges !== "boolean") return null;
  return {
    ...draft,
    createdAt: parsedValue.createdAt,
    updatedAt: parsedValue.updatedAt,
    serverRevision: serverRevision as number,
    hasLocalChanges,
  };
};

export const escrowCreationDraftStorageKey = (userId: string) =>
  `myescrow:agreement-creation-draft:${encodeURIComponent(userId)}`;

export const escrowCreationDraftConflictStorageKey = (userId: string) =>
  `${escrowCreationDraftStorageKey(userId)}:conflict`;

const browserStorage = (): StorageAdapter | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const readEscrowCreationDraftCache = (
  userId: string,
  storage: StorageAdapter | null = browserStorage(),
): StoredEscrowCreationDraft | null => {
  if (!userId.trim() || !storage) return null;
  try {
    return parseStoredEscrowCreationDraft(
      storage.getItem(escrowCreationDraftStorageKey(userId)),
    );
  } catch {
    return null;
  }
};

export const createStoredEscrowCreationDraft = (
  draft: EscrowCreationDraftData,
  previousDraft: StoredEscrowCreationDraft | null = null,
  updatedAt = new Date().toISOString(),
  serverRevision = previousDraft?.serverRevision ?? 0,
  hasLocalChanges = true,
): StoredEscrowCreationDraft | null => {
  const parsedDraft = parseEscrowCreationDraftData(draft);
  if (
    !parsedDraft
    || !isTimestamp(updatedAt)
    || !Number.isSafeInteger(serverRevision)
    || serverRevision < 0
    || typeof hasLocalChanges !== "boolean"
  ) return null;
  const proposedUpdatedAt = Date.parse(updatedAt);
  const previousUpdatedAt = previousDraft ? Date.parse(previousDraft.updatedAt) : Number.NEGATIVE_INFINITY;
  const monotonicUpdatedAt = new Date(
    proposedUpdatedAt > previousUpdatedAt ? proposedUpdatedAt : previousUpdatedAt + 1,
  ).toISOString();
  return {
    ...parsedDraft,
    createdAt: previousDraft?.createdAt ?? monotonicUpdatedAt,
    updatedAt: monotonicUpdatedAt,
    serverRevision,
    hasLocalChanges,
  };
};

export const writeEscrowCreationDraftCache = (
  userId: string,
  draft: EscrowCreationDraftData | StoredEscrowCreationDraft,
  storage: StorageAdapter | null = browserStorage(),
  serverRevision?: number,
): StoredEscrowCreationDraft | null => {
  if (!userId.trim() || !storage) return null;
  const storedDraft = parseStoredEscrowCreationDraft(draft)
    ?? createStoredEscrowCreationDraft(
      draft,
      readEscrowCreationDraftCache(userId, storage),
      undefined,
      serverRevision,
    );
  if (!storedDraft) return null;
  try {
    storage.setItem(escrowCreationDraftStorageKey(userId), JSON.stringify(storedDraft));
    return storedDraft;
  } catch {
    return null;
  }
};

export const clearEscrowCreationDraftCache = (
  userId: string,
  storage: StorageAdapter | null = browserStorage(),
): boolean => {
  if (!userId.trim() || !storage) return false;
  try {
    storage.removeItem(escrowCreationDraftStorageKey(userId));
    return true;
  } catch {
    return false;
  }
};

export const readEscrowCreationDraftConflictCache = (
  userId: string,
  storage: StorageAdapter | null = browserStorage(),
): StoredEscrowCreationDraft | null => {
  if (!userId.trim() || !storage) return null;
  try {
    return parseStoredEscrowCreationDraft(
      storage.getItem(escrowCreationDraftConflictStorageKey(userId)),
    );
  } catch {
    return null;
  }
};

export const writeEscrowCreationDraftConflictCache = (
  userId: string,
  draft: StoredEscrowCreationDraft,
  storage: StorageAdapter | null = browserStorage(),
): boolean => {
  if (!userId.trim() || !storage) return false;
  const parsedDraft = parseStoredEscrowCreationDraft(draft);
  if (!parsedDraft) return false;
  try {
    storage.setItem(
      escrowCreationDraftConflictStorageKey(userId),
      JSON.stringify(parsedDraft),
    );
    return true;
  } catch {
    return false;
  }
};

export const clearEscrowCreationDraftConflictCache = (
  userId: string,
  storage: StorageAdapter | null = browserStorage(),
): boolean => {
  if (!userId.trim() || !storage) return false;
  try {
    storage.removeItem(escrowCreationDraftConflictStorageKey(userId));
    return true;
  } catch {
    return false;
  }
};

export const newestEscrowCreationDraft = (
  localDraft: StoredEscrowCreationDraft | null | undefined,
  serverDraft: StoredEscrowCreationDraft | null | undefined,
): StoredEscrowCreationDraft | null => {
  if (!localDraft) return serverDraft ?? null;
  if (!serverDraft) return localDraft;
  if (localDraft.serverRevision !== serverDraft.serverRevision) {
    return localDraft.serverRevision > serverDraft.serverRevision ? localDraft : serverDraft;
  }
  return Date.parse(localDraft.updatedAt) > Date.parse(serverDraft.updatedAt)
    ? localDraft
    : serverDraft;
};

export const hasMeaningfulEscrowCreationDraft = (draft: EscrowCreationDraftData) => {
  const { createForm, milestoneInputs } = draft;
  return draft.screen !== "create"
    || draft.createPromptStep !== 0
    || draft.descriptionSkipped
    || createForm.role !== "buyer"
    || createForm.partyType !== "individual"
    || createForm.counterpartyEmail.trim() !== ""
    || createForm.counterpartyEmailConfirmation.trim() !== ""
    || createForm.title.trim() !== ""
    || createForm.amount.trim() !== ""
    || createForm.category !== "Goods"
    || createForm.description.trim() !== ""
    || createForm.fundingMode !== null
    || createForm.business.legalName.trim() !== ""
    || createForm.business.representativeTitle.trim() !== ""
    || draft.milestones.length > 0
    || milestoneInputs.title.trim() !== ""
    || milestoneInputs.amount.trim() !== ""
    || milestoneInputs.description.trim() !== ""
    || milestoneInputs.deadline.trim() !== ""
    || draft.editingMilestoneId !== null;
};
