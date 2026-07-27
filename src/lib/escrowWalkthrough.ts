export const escrowDetailPrompts = [
  { shortLabel: "Role", title: "What is your role in this transaction?" },
  { shortLabel: "Identity", title: "Who are you creating this escrow for?" },
  { shortLabel: "Counterparty", title: "Who is the other party?" },
  { shortLabel: "Transaction", title: "What is this escrow for?" },
  { shortLabel: "Amount", title: "How much will be held in escrow?" },
  { shortLabel: "Scope", title: "What should the agreement cover?" },
] as const;

export type EscrowDetailPromptIndex = 0 | 1 | 2 | 3 | 4 | 5;

export type EscrowDetailAnswers = {
  partyType: "individual" | "business";
  business: {
    legalName: string;
    representativeTitle: string;
  };
  counterpartyEmail: string;
  counterpartyEmailConfirmation: string;
  currentUserEmail: string;
  title: string;
  amount: string;
  description: string;
  descriptionSkipped: boolean;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEscrowDetailPrompt(
  prompt: EscrowDetailPromptIndex,
  answers: EscrowDetailAnswers,
): string | null {
  if (prompt === 1 && answers.partyType === "business") {
    if (answers.business.legalName.trim().length < 2) {
      return "Enter the business name to continue.";
    }
    if (answers.business.representativeTitle.trim().length < 2) {
      return "Enter your title at the business to continue.";
    }
  }

  if (prompt === 2) {
    const email = answers.counterpartyEmail.trim();
    const emailConfirmation = answers.counterpartyEmailConfirmation.trim();
    if (!email) {
      return "Enter the counterparty's email to continue.";
    }
    if (!emailPattern.test(email)) {
      return "Enter a valid email address.";
    }
    if (email.toLowerCase() === answers.currentUserEmail.trim().toLowerCase()) {
      return "Use an email address other than your own.";
    }
    if (!emailConfirmation) {
      return "Enter the counterparty's email again to confirm it.";
    }
    if (!emailPattern.test(emailConfirmation)) {
      return "Enter a valid confirmation email address.";
    }
    if (email.toLowerCase() !== emailConfirmation.toLowerCase()) {
      return "The email addresses do not match. Check both entries.";
    }
  }

  if (prompt === 3 && !answers.title.trim()) {
    return "Give this escrow a clear name to continue.";
  }

  if (prompt === 4) {
    const amount = Number(answers.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return "Enter an amount greater than $0.";
    }
  }

  if (prompt === 5 && !answers.description.trim() && !answers.descriptionSkipped) {
    return "Add a short scope or choose “Skip for now”.";
  }

  return null;
}
