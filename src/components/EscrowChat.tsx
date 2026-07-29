"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  useEscrowMessages,
  useSendEscrowMessage,
} from "@/hooks/useDashboardData";

type EscrowChatProps = {
  escrowId: string;
  counterpart: string;
};

export function EscrowChat({ escrowId, counterpart }: EscrowChatProps) {
  const { user } = useAuth();
  const messagesQuery = useEscrowMessages(escrowId);
  const sendMessage = useSendEscrowMessage(escrowId);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const messages = messagesQuery.data?.messages ?? [];

  useEffect(() => {
    const messageList = messageListRef.current;
    if (messageList) {
      messageList.scrollTop = messageList.scrollHeight;
    }
  }, [messages.length]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sendMessage.isPending) return;
    setSendError(null);
    try {
      await sendMessage.mutateAsync({ body });
      setDraft("");
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Unable to send the message.");
    }
  };

  return (
    <section className="card escrow-chat-card" aria-labelledby={`escrow-chat-title-${escrowId}`}>
      <div className="escrow-chat-card__header">
        <div>
          <div className="escrow-chat-card__eyebrow">Buyer–seller chat</div>
          <h3 id={`escrow-chat-title-${escrowId}`}>Conversation with {counterpart}</h3>
          <p className="muted">
            This conversation stays with the escrow before, during, and after a dispute or closure.
          </p>
        </div>
        <span className="escrow-chat-card__availability">Always available</span>
      </div>

      {messagesQuery.isLoading ? (
        <div className="escrow-chat-status muted">Loading conversation…</div>
      ) : messagesQuery.isError ? (
        <div className="field-warning" role="alert">
          {messagesQuery.error instanceof Error
            ? messagesQuery.error.message
            : "Unable to load the conversation."}
        </div>
      ) : (
        <>
          <div
            className="escrow-chat-messages"
            ref={messageListRef}
            role="log"
            aria-live="polite"
            aria-label={`Messages with ${counterpart}`}
          >
            {messages.length ? (
              messages.map((message) => {
                const isMine = message.sender.id === user?.id;
                return (
                  <article
                    className={`escrow-chat-message ${isMine ? "escrow-chat-message--mine" : ""}`}
                    key={message.id}
                  >
                    <div className="escrow-chat-message__meta">
                      <strong>{isMine ? "You" : message.sender.name}</strong>
                      <span>
                        {new Intl.DateTimeFormat(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(message.createdAt))}
                      </span>
                    </div>
                    <p>{message.body}</p>
                  </article>
                );
              })
            ) : (
              <div className="escrow-chat-empty">
                <strong>No messages yet</strong>
                <span>Use this shared record to clarify terms, progress, or a disagreement.</span>
              </div>
            )}
          </div>

          {messagesQuery.data?.canSend ? (
            <form className="escrow-chat-composer" onSubmit={handleSubmit}>
              <label htmlFor={`escrow-chat-draft-${escrowId}`}>Message {counterpart}</label>
              <textarea
                id={`escrow-chat-draft-${escrowId}`}
                rows={3}
                maxLength={5_000}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Write a message about this escrow…"
              />
              <div className="escrow-chat-composer__actions">
                <span className="muted">{draft.length.toLocaleString()} / 5,000</span>
                <button className="btn" type="submit" disabled={!draft.trim() || sendMessage.isPending}>
                  {sendMessage.isPending ? "Sending…" : "Send message"}
                </button>
              </div>
              {sendError ? <div className="field-warning" role="alert">{sendError}</div> : null}
            </form>
          ) : (
            <div className="escrow-chat-status muted">
              {messagesQuery.data?.unavailableReason}
            </div>
          )}
        </>
      )}

      <p className="escrow-chat-card__evidence-note muted">
        Messages are an append-only communication record and may be reviewed by authorized arbitration staff if arbitration is requested. Submit important material through the dispute evidence flow when it must be considered as formal evidence.
      </p>
    </section>
  );
}
