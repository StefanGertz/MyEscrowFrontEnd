import { describe, expect, it } from "vitest";
import { moveItem, sortByDeadline } from "@/lib/milestoneOrdering";

describe("milestone ordering", () => {
  const milestones = [
    { id: "late", deadline: "2026-09-15" },
    { id: "undated", deadline: "" },
    { id: "early", deadline: "2026-07-01" },
    { id: "middle", deadline: "2026-08-10" },
  ];

  it("sorts deadlines chronologically and leaves undated milestones last", () => {
    expect(sortByDeadline(milestones).map(({ id }) => id)).toEqual([
      "early",
      "middle",
      "late",
      "undated",
    ]);
  });

  it("moves a milestone without mutating the existing list", () => {
    const reordered = moveItem(milestones, 2, 0);

    expect(reordered.map(({ id }) => id)).toEqual(["early", "late", "undated", "middle"]);
    expect(milestones.map(({ id }) => id)).toEqual(["late", "undated", "early", "middle"]);
  });
});
