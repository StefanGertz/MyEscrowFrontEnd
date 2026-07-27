import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ConfirmDialogProvider,
  useConfirmDialog,
} from "@/components/ConfirmDialogProvider";

afterEach(() => {
  cleanup();
});

function ConfirmTrigger({ onConfirm }: { onConfirm: () => Promise<void> }) {
  const { confirm } = useConfirmDialog();
  return (
    <button
      onClick={() =>
        confirm({
          title: "Fund milestone?",
          body: "Move funds into escrow.",
          confirmLabel: "Fund milestone",
          onConfirm,
        })
      }
    >
      Open confirmation
    </button>
  );
}

describe("confirmation dialog", () => {
  it("stays open and shows progress until an async action finishes", async () => {
    let finishFunding: (() => void) | undefined;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishFunding = resolve;
        }),
    );

    render(
      <ConfirmDialogProvider>
        <ConfirmTrigger onConfirm={onConfirm} />
      </ConfirmDialogProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open confirmation" }));
    fireEvent.click(screen.getByRole("button", { name: "Fund milestone" }));

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Fund milestone…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    finishFunding?.();

    await waitFor(() => {
      expect(screen.queryByText("Fund milestone?")).not.toBeInTheDocument();
    });
  });
});
