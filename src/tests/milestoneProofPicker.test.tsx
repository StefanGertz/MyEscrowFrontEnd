import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { MilestoneProofPicker } from "@/components/MilestoneProofPicker";

afterEach(cleanup);

function Harness({ onSelect = vi.fn() }: { onSelect?: (files: FileList | null) => void }) {
  const [files, setFiles] = useState<File[]>([]);

  return (
    <MilestoneProofPicker
      files={files}
      onSelect={(selected) => {
        onSelect(selected);
        setFiles(Array.from(selected ?? []));
      }}
      onRemove={(index) => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}
    />
  );
}

describe("milestone proof picker", () => {
  it("uses the managed file list instead of retaining Safari's native preview", () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    const originalInput = screen.getByLabelText("Choose proof of completion files") as HTMLInputElement;
    const photo = new File([new Uint8Array(7_900_000)], "IMG_1780.jpeg", { type: "image/jpeg" });

    fireEvent.change(originalInput, { target: { files: [photo] } });

    expect(screen.getByRole("button", { name: "Remove IMG_1780.jpeg" })).toBeInTheDocument();
    const resetInput = screen.getByLabelText("Choose proof of completion files") as HTMLInputElement;
    expect(resetInput).not.toBe(originalInput);
    expect(resetInput.files).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Remove IMG_1780.jpeg" }));

    expect(screen.queryByText("IMG_1780.jpeg")).not.toBeInTheDocument();
    const inputAfterRemoval = screen.getByLabelText("Choose proof of completion files") as HTMLInputElement;
    expect(inputAfterRemoval.files).toHaveLength(0);

    fireEvent.change(inputAfterRemoval, { target: { files: [photo] } });

    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Remove IMG_1780.jpeg" })).toBeInTheDocument();
  });

  it("resets the native input even when the parent rejects a selection", () => {
    const onSelect = vi.fn();
    render(<MilestoneProofPicker files={[]} onSelect={onSelect} onRemove={vi.fn()} />);
    const originalInput = screen.getByLabelText("Choose proof of completion files") as HTMLInputElement;
    const oversized = new File(["proof"], "too-large.jpeg", { type: "image/jpeg" });

    fireEvent.change(originalInput, { target: { files: [oversized] } });

    expect(onSelect).toHaveBeenCalledOnce();
    const resetInput = screen.getByLabelText("Choose proof of completion files") as HTMLInputElement;
    expect(resetInput).not.toBe(originalInput);
    expect(resetInput.files).toHaveLength(0);
  });
});
