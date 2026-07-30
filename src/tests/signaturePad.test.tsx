import { createRef } from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SignaturePad,
  type SignaturePadHandle,
} from "@/components/SignaturePad";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("signature pad", () => {
  it("keeps the signature when the parent supplies a new change callback", () => {
    const context = {
      beginPath: vi.fn(),
      clearRect: vi.fn(),
      closePath: vi.fn(),
      fillRect: vi.fn(),
      lineTo: vi.fn(),
      moveTo: vi.fn(),
      stroke: vi.fn(),
      fillStyle: "",
      lineCap: "",
      lineJoin: "",
      lineWidth: 0,
      strokeStyle: "",
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      "data:image/png;base64,signed",
    );

    const ref = createRef<SignaturePadHandle>();
    const firstOnSignedChange = vi.fn();
    const secondOnSignedChange = vi.fn();
    const view = render(
      <SignaturePad
        ref={ref}
        resetVersion={0}
        onSignedChange={firstOnSignedChange}
      />,
    );
    const canvas = view.container.querySelector("canvas");
    expect(canvas).not.toBeNull();
    if (!canvas) return;

    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      bottom: 140,
      height: 140,
      left: 0,
      right: 320,
      top: 0,
      width: 320,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    canvas.setPointerCapture = vi.fn();
    canvas.releasePointerCapture = vi.fn();

    firstOnSignedChange.mockClear();
    fireEvent.pointerDown(canvas, { clientX: 20, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 80, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });

    expect(firstOnSignedChange).toHaveBeenCalledWith(true);
    expect(ref.current?.getDataUrl()).toBe("data:image/png;base64,signed");

    vi.mocked(context.clearRect).mockClear();
    view.rerender(
      <SignaturePad
        ref={ref}
        resetVersion={0}
        onSignedChange={secondOnSignedChange}
      />,
    );

    expect(context.clearRect).not.toHaveBeenCalled();
    expect(ref.current?.getDataUrl()).toBe("data:image/png;base64,signed");

    ref.current?.clear();
    expect(secondOnSignedChange).toHaveBeenCalledWith(false);
  });
});
