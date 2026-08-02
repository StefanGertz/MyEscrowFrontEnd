import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  escrowCreationDraftQueryKey,
  useCreateEscrow,
  useDeleteEscrowCreationDraft,
  useEscrowCreationDraft,
  useSaveEscrowCreationDraft,
} from "@/hooks/useDashboardData";
import {
  ESCROW_CREATION_DRAFT_SCHEMA_VERSION,
  type EscrowCreationDraftData,
  type EscrowCreationDraftServerState,
  type StoredEscrowCreationDraft,
} from "@/lib/escrowCreationDraft";
import { resetAgreementDraftFixture, server } from "./server";

const draftData = (): EscrowCreationDraftData => ({
  schemaVersion: ESCROW_CREATION_DRAFT_SCHEMA_VERSION,
  screen: "milestones",
  createPromptStep: 6,
  descriptionSkipped: false,
  createForm: {
    role: "buyer",
    counterpartyEmail: "seller@example.com",
    counterpartyEmailConfirmation: "seller@example.com",
    title: "Integration draft",
    amount: "75000",
    category: "Services",
    description: "Staging draft test",
    fundingMode: "milestone",
    partyType: "individual",
    business: { legalName: "", representativeTitle: "" },
  },
  milestones: [
    {
      id: "milestone-one",
      title: "Delivery",
      amount: 50000,
      description: "First delivery",
      deadline: "2026-10-01",
    },
  ],
  milestoneInputs: {
    title: "Final handoff",
    amount: "25000",
    description: "Partial editor contents",
    deadline: "2026-11-01",
  },
  editingMilestoneId: "milestone-two",
});

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const createWrapper = (queryClient: QueryClient) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = "AgreementDraftTestProvider";
  return Wrapper;
};

beforeAll(() => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://staging-api.myescrow.example/v1";
  process.env.NEXT_PUBLIC_USE_MOCKS = "false";
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  resetAgreementDraftFixture();
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

describe("agreement creation draft hooks", () => {
  it("loads, saves, and deletes the singleton draft while keeping query data current", async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);
    const queryHook = renderHook(() => useEscrowCreationDraft(), { wrapper });

    await waitFor(() => expect(queryHook.result.current.isSuccess).toBe(true));
    expect(queryHook.result.current.data).toEqual({ draft: null, revision: 0 });

    const saveHook = renderHook(() => useSaveEscrowCreationDraft(), { wrapper });
    let savedState: EscrowCreationDraftServerState | undefined;
    await act(async () => {
      savedState = await saveHook.result.current.mutateAsync({ baseRevision: 0, draft: draftData() });
    });

    const savedDraft = savedState?.draft;
    expect(savedDraft).toMatchObject(draftData());
    expect(savedDraft?.createdAt).toEqual(expect.any(String));
    expect(savedDraft?.updatedAt).toEqual(expect.any(String));
    expect(queryClient.getQueryData(escrowCreationDraftQueryKey)).toEqual(savedState);

    await act(async () => {
      await queryHook.result.current.refetch();
    });
    expect(queryHook.result.current.data).toEqual(savedState);

    const deleteHook = renderHook(() => useDeleteEscrowCreationDraft(), { wrapper });
    await act(async () => {
      await deleteHook.result.current.mutateAsync(savedState?.revision ?? -1);
    });
    expect(queryClient.getQueryData(escrowCreationDraftQueryKey)).toEqual({ draft: null, revision: 2 });

    await act(async () => {
      await queryHook.result.current.refetch();
    });
    expect(queryHook.result.current.data).toEqual({ draft: null, revision: 2 });
  });

  it("drops signatures and agreement consent before sending a draft", async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);
    const saveHook = renderHook(() => useSaveEscrowCreationDraft(), { wrapper });
    const unsafeDraft = {
      ...draftData(),
      agreementAccepted: true,
      signatureDataUrl: "data:image/png;base64,not-sent",
      createForm: {
        ...draftData().createForm,
        signatureDataUrl: "data:image/png;base64,also-not-sent",
      },
    } as EscrowCreationDraftData;

    let savedDraft: StoredEscrowCreationDraft | null | undefined;
    await act(async () => {
      const state = await saveHook.result.current.mutateAsync({ baseRevision: 0, draft: unsafeDraft });
      savedDraft = state.draft;
    });

    expect(savedDraft).not.toHaveProperty("agreementAccepted");
    expect(savedDraft).not.toHaveProperty("signatureDataUrl");
    expect(savedDraft?.createForm).not.toHaveProperty("signatureDataUrl");
  });

  it("clears the cached draft after a successful final escrow creation", async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);
    const saveHook = renderHook(() => useSaveEscrowCreationDraft(), { wrapper });
    let savedState: EscrowCreationDraftServerState | undefined;
    await act(async () => {
      savedState = await saveHook.result.current.mutateAsync({ baseRevision: 0, draft: draftData() });
    });
    expect(queryClient.getQueryData(escrowCreationDraftQueryKey)).not.toBeNull();

    const createHook = renderHook(() => useCreateEscrow(), { wrapper });
    await act(async () => {
      await createHook.result.current.mutateAsync({
        title: "Integration draft",
        counterpartyEmail: "seller@example.com",
        amount: 75000,
        fundingMode: "milestone",
        creatorRole: "buyer",
        creatorParty: { type: "individual" },
        description: "Staging draft test",
        draftRevision: savedState?.revision,
      });
    });

    expect(queryClient.getQueryData(escrowCreationDraftQueryKey)).toBeUndefined();
  });

  it("rejects a stale final submission and preserves the newer draft", async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);
    const saveHook = renderHook(() => useSaveEscrowCreationDraft(), { wrapper });
    const first = await saveHook.result.current.mutateAsync({ baseRevision: 0, draft: draftData() });
    const newerDraft = {
      ...draftData(),
      createForm: { ...draftData().createForm, title: "Newer session draft" },
    };
    const newer = await saveHook.result.current.mutateAsync({
      baseRevision: first.revision,
      draft: newerDraft,
    });

    const createHook = renderHook(() => useCreateEscrow(), { wrapper });
    await expect(createHook.result.current.mutateAsync({
      title: "Stale draft",
      counterpartyEmail: "seller@example.com",
      amount: 75000,
      fundingMode: "milestone",
      creatorRole: "buyer",
      creatorParty: { type: "individual" },
      draftRevision: first.revision,
    })).rejects.toThrow("changed in another session");

    const queryHook = renderHook(() => useEscrowCreationDraft(), { wrapper });
    await waitFor(() => expect(queryHook.result.current.data?.revision).toBe(newer.revision));
    expect(queryHook.result.current.data?.draft?.createForm.title).toBe("Newer session draft");
  });

  it("does not let a delayed GET overwrite a newer save result", async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);
    const saveHook = renderHook(() => useSaveEscrowCreationDraft(), { wrapper });
    const first = await saveHook.result.current.mutateAsync({ baseRevision: 0, draft: draftData() });
    if (!first.draft) throw new Error("Expected the fixture draft to be saved.");
    let releaseGet: (() => void) | undefined;
    const delayed = new Promise<void>((resolve) => {
      releaseGet = resolve;
    });
    server.use(http.get(
      "https://staging-api.myescrow.example/v1/api/dashboard/agreement-draft",
      async () => {
        await delayed;
        const responseDraft = { ...first.draft } as Partial<StoredEscrowCreationDraft>;
        delete responseDraft.serverRevision;
        delete responseDraft.hasLocalChanges;
        return HttpResponse.json({ draft: responseDraft, revision: first.revision });
      },
    ));
    renderHook(() => useEscrowCreationDraft(), { wrapper });
    await waitFor(() => expect(queryClient.isFetching()).toBe(1));

    const newer = await saveHook.result.current.mutateAsync({
      baseRevision: first.revision,
      draft: {
        ...draftData(),
        createForm: { ...draftData().createForm, title: "Saved while GET was pending" },
      },
    });
    releaseGet?.();
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));

    expect(queryClient.getQueryData(escrowCreationDraftQueryKey)).toEqual(newer);
  });

  it("refetches the newer server draft after a stale save conflict", async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);
    const queryHook = renderHook(() => useEscrowCreationDraft(), { wrapper });
    await waitFor(() => expect(queryHook.result.current.isSuccess).toBe(true));
    const saveHook = renderHook(() => useSaveEscrowCreationDraft(), { wrapper });
    let first: EscrowCreationDraftServerState | undefined;
    await act(async () => {
      first = await saveHook.result.current.mutateAsync({ baseRevision: 0, draft: draftData() });
    });
    if (!first) throw new Error("Expected the fixture draft to be saved.");
    let externallySaved: Response | undefined;
    await act(async () => {
      externallySaved = await fetch(
        "https://staging-api.myescrow.example/v1/api/dashboard/agreement-draft",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            baseRevision: first?.revision,
            draft: {
              ...draftData(),
              createForm: { ...draftData().createForm, title: "External newer draft" },
            },
          }),
        },
      );
    });
    expect(externallySaved?.ok).toBe(true);

    let staleError: unknown;
    await act(async () => {
      try {
        await saveHook.result.current.mutateAsync({
          baseRevision: first?.revision ?? -1,
          draft: {
            ...draftData(),
            createForm: { ...draftData().createForm, title: "Stale local save" },
          },
        });
      } catch (error) {
        staleError = error;
      }
    });
    expect(staleError).toBeInstanceOf(Error);
    expect((staleError as Error).message).toContain("changed in another session");

    await waitFor(() => expect(
      (queryClient.getQueryData(escrowCreationDraftQueryKey) as EscrowCreationDraftServerState | undefined)?.revision,
    ).toBe(2));
    queryHook.rerender();
    await waitFor(() => expect(queryHook.result.current.data?.revision).toBe(2));
    expect(queryHook.result.current.data?.draft?.createForm.title).toBe("External newer draft");
  });
});
