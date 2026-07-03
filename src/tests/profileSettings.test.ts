import { describe, expect, it } from "vitest";
import { resolveProfileDraft } from "@/lib/profileSettings";

describe("settings profile identity", () => {
  const stefan = {
    id: "user-stefan",
    name: "Stefan Gertz",
    email: "stefan@example.com",
  };

  it("uses the authenticated identity instead of another user's draft", () => {
    expect(
      resolveProfileDraft(
        { userId: "demo-scott", name: "Scott", email: "scott@example.com" },
        stefan,
      ),
    ).toEqual({ name: "Stefan Gertz", email: "stefan@example.com" });
  });

  it("preserves edits belonging to the authenticated user", () => {
    expect(
      resolveProfileDraft(
        { userId: stefan.id, name: "Stefan J. Gertz", email: stefan.email },
        stefan,
      ),
    ).toEqual({ name: "Stefan J. Gertz", email: "stefan@example.com" });
  });
});
