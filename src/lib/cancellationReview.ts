export type CancellationParty = "buyer" | "seller";

export type CancellationReviewMessage = {
  id: number;
  kind: string;
  requestRecipient?: CancellationParty | "both";
  respondingParty?: CancellationParty;
  inResponseToMessageId?: number;
};

export const informationRequestParties = (
  message: CancellationReviewMessage,
): CancellationParty[] => message.requestRecipient === "buyer"
  ? ["buyer"]
  : message.requestRecipient === "seller"
    ? ["seller"]
    : ["buyer", "seller"];

export const informationRequestResponses = <Message extends CancellationReviewMessage>(
  messages: Message[],
  requestMessageId: number,
) => messages.filter((message) => message.inResponseToMessageId === requestMessageId);

export const pendingInformationRequests = <Message extends CancellationReviewMessage>(
  messages: Message[],
  party: CancellationParty,
) => messages.filter((message) => {
  if (message.kind !== "request_information") return false;
  if (!informationRequestParties(message).includes(party)) return false;
  return !informationRequestResponses(messages, message.id).some(
    (response) => response.respondingParty === party,
  );
});
