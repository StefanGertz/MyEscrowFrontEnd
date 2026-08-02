import { NextRequest, NextResponse } from "next/server";
import { isMockApiEnabled } from "@/lib/mockToggle";
import { proxyApiRequest } from "@/lib/serverProxy";
import {
  consumeMockAgreementDraftForCreate,
  mockAgreementDraftScope,
} from "@/lib/mockAgreementDraftStore";

type CreatePayload = {
  title: string;
  counterpartyEmail: string;
  amount: number;
  draftRevision?: number;
  fundingMode?: "full" | "milestone";
  creatorRole: "buyer" | "seller";
  category?: string;
  description?: string;
  milestones?: Array<{
    title: string;
    amount: number;
    description?: string;
  }>;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(request: NextRequest) {
  if (!isMockApiEnabled) {
    return proxyApiRequest(request, "/api/dashboard/escrows/create");
  }

  const body = (await request.json()) as CreatePayload;
  if (
    body.draftRevision !== undefined
    && (!Number.isSafeInteger(body.draftRevision) || body.draftRevision < 0)
  ) {
    return NextResponse.json({ error: "The agreement draft revision was invalid." }, { status: 400 });
  }
  const consumedDraft = consumeMockAgreementDraftForCreate(
    mockAgreementDraftScope(request),
    body.draftRevision,
  );
  if (!consumedDraft) {
    return NextResponse.json(
      { error: "This agreement draft changed in another session. Reload it before submitting." },
      { status: 409 },
    );
  }
  await sleep(600);

  return NextResponse.json({
    success: true,
    escrowId: Math.floor(10000 + Math.random() * 90000),
    title: body.title,
    description: body.description,
    counterpart: body.counterpartyEmail,
    counterpartyEmail: body.counterpartyEmail,
    amount: body.amount,
    fundingMode: body.fundingMode,
    creatorRole: body.creatorRole,
    category: body.category,
    milestones: body.milestones,
    createdAt: new Date().toISOString(),
  });
}
