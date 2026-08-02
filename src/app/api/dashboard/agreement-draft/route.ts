import { NextRequest, NextResponse } from "next/server";
import {
  parseEscrowCreationDraftData,
  type StoredEscrowCreationDraft,
} from "@/lib/escrowCreationDraft";
import { isMockApiEnabled } from "@/lib/mockToggle";
import { proxyApiRequest } from "@/lib/serverProxy";
import {
  discardMockAgreementDraft,
  getMockAgreementDraftState,
  mockAgreementDraftScope,
  saveMockAgreementDraft,
} from "@/lib/mockAgreementDraftStore";

const publicDraft = (draft: StoredEscrowCreationDraft | null) => {
  if (!draft) return null;
  const responseDraft: Partial<StoredEscrowCreationDraft> = { ...draft };
  delete responseDraft.serverRevision;
  delete responseDraft.hasLocalChanges;
  return responseDraft;
};

export async function GET(request: NextRequest) {
  if (!isMockApiEnabled) {
    return proxyApiRequest(request, "/api/dashboard/agreement-draft");
  }
  const state = getMockAgreementDraftState(mockAgreementDraftScope(request));
  return NextResponse.json(
    { draft: publicDraft(state.draft), revision: state.revision },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function PUT(request: NextRequest) {
  if (!isMockApiEnabled) {
    return proxyApiRequest(request, "/api/dashboard/agreement-draft");
  }

  let draftInput: unknown;
  try {
    draftInput = await request.json();
  } catch {
    return NextResponse.json({ error: "The agreement draft payload was invalid." }, { status: 400 });
  }
  if (typeof draftInput !== "object" || draftInput === null) {
    return NextResponse.json({ error: "The agreement draft payload was invalid." }, { status: 400 });
  }
  const { baseRevision, draft } = draftInput as { baseRevision?: unknown; draft?: unknown };
  const parsedDraft = parseEscrowCreationDraftData(draft);
  if (!Number.isSafeInteger(baseRevision) || (baseRevision as number) < 0 || !parsedDraft) {
    return NextResponse.json({ error: "The agreement draft payload was invalid." }, { status: 400 });
  }

  const state = saveMockAgreementDraft(
    mockAgreementDraftScope(request),
    baseRevision as number,
    parsedDraft,
  );
  if (!state?.draft) {
    return NextResponse.json(
      { error: "The agreement draft changed in another session." },
      { status: 409 },
    );
  }
  return NextResponse.json({ draft: publicDraft(state.draft), revision: state.revision });
}

export async function DELETE(request: NextRequest) {
  if (!isMockApiEnabled) {
    return proxyApiRequest(request, "/api/dashboard/agreement-draft");
  }
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "The agreement draft payload was invalid." }, { status: 400 });
  }
  const baseRevision = typeof input === "object" && input !== null
    ? (input as { baseRevision?: unknown }).baseRevision
    : undefined;
  if (!Number.isSafeInteger(baseRevision) || (baseRevision as number) < 0) {
    return NextResponse.json({ error: "The agreement draft payload was invalid." }, { status: 400 });
  }

  const state = discardMockAgreementDraft(
    mockAgreementDraftScope(request),
    baseRevision as number,
  );
  if (!state) {
    return NextResponse.json(
      { error: "The agreement draft changed in another session." },
      { status: 409 },
    );
  }
  return NextResponse.json({ success: true, draft: null, revision: state.revision });
}
