export type ProfileIdentity = {
  id: string;
  name: string;
  email: string;
};

export type ProfileDraft = {
  userId: string;
  name: string;
  email: string;
};

export function resolveProfileDraft(
  draft: ProfileDraft,
  identity: ProfileIdentity,
): Pick<ProfileDraft, "name" | "email"> {
  if (draft.userId === identity.id) {
    return { name: draft.name, email: draft.email };
  }

  return { name: identity.name, email: identity.email };
}
