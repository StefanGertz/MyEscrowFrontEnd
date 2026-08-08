import { describe, expect, it } from "vitest";
import {
  informationRequestParties,
  pendingInformationRequests,
  type CancellationReviewMessage,
} from "@/lib/cancellationReview";

describe("targeted cancellation information requests", () => {
  const bothRequest: CancellationReviewMessage = {
    id: 10,
    kind: "request_information",
    requestRecipient: "both",
  };

  it("addresses buyer-only requests only to the buyer", () => {
    const request: CancellationReviewMessage = {
      id: 11,
      kind: "request_information",
      requestRecipient: "buyer",
    };

    expect(informationRequestParties(request)).toEqual(["buyer"]);
    expect(pendingInformationRequests([request], "buyer")).toEqual([request]);
    expect(pendingInformationRequests([request], "seller")).toEqual([]);
  });

  it("keeps a shared request pending for the party that has not responded", () => {
    const sellerResponse: CancellationReviewMessage = {
      id: 12,
      kind: "party_response",
      respondingParty: "seller",
      inResponseToMessageId: bothRequest.id,
    };

    expect(pendingInformationRequests([bothRequest, sellerResponse], "seller")).toEqual([]);
    expect(pendingInformationRequests([bothRequest, sellerResponse], "buyer")).toEqual([bothRequest]);
  });

  it("marks a shared request complete separately for both parties", () => {
    const responses: CancellationReviewMessage[] = [
      {
        id: 13,
        kind: "party_response",
        respondingParty: "seller",
        inResponseToMessageId: bothRequest.id,
      },
      {
        id: 14,
        kind: "party_response",
        respondingParty: "buyer",
        inResponseToMessageId: bothRequest.id,
      },
    ];

    expect(pendingInformationRequests([bothRequest, ...responses], "seller")).toEqual([]);
    expect(pendingInformationRequests([bothRequest, ...responses], "buyer")).toEqual([]);
  });
});
