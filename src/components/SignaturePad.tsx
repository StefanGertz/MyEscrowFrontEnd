"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

export type SignaturePadHandle = {
  clear: () => void;
};

type SignaturePadProps = {
  onSignedChange: (signed: boolean) => void;
  resetVersion: number;
};

export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(
  function SignaturePad({ onSignedChange, resetVersion }, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const isDrawingRef = useRef(false);
    const hasDrawnRef = useRef(false);

    const resizeCanvas = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const { width } = canvas.getBoundingClientRect();
      const height = 140;
      const needsResize = canvas.width !== width || canvas.height !== height;
      if (needsResize) {
        canvas.width = width;
        canvas.height = height;
      }
    }, []);

    const clearCanvas = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      hasDrawnRef.current = false;
      onSignedChange(false);
    }, [onSignedChange]);

    useImperativeHandle(ref, () => ({
      clear: () => clearCanvas(),
    }));

    useEffect(() => {
      resizeCanvas();
      clearCanvas();
      const handleResize = () => resizeCanvas();
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }, [clearCanvas, resizeCanvas]);

    useEffect(() => {
      clearCanvas();
    }, [clearCanvas, resetVersion]);

    const getCanvasPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return null;
      }
      const rect = canvas.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context) return;
      const point = getCanvasPoint(event);
      if (!point) return;
      isDrawingRef.current = true;
      context.lineWidth = 2;
      context.lineJoin = "round";
      context.lineCap = "round";
      context.strokeStyle = "#0f4c81";
      context.beginPath();
      context.moveTo(point.x, point.y);
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawingRef.current) return;
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context) return;
      const point = getCanvasPoint(event);
      if (!point) return;
      context.lineTo(point.x, point.y);
      context.stroke();
      if (!hasDrawnRef.current) {
        hasDrawnRef.current = true;
        onSignedChange(true);
      }
      event.preventDefault();
    };

    const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (isDrawingRef.current) {
        const context = canvas.getContext("2d");
        context?.closePath();
      }
      isDrawingRef.current = false;
      canvas.releasePointerCapture(event.pointerId);
      event.preventDefault();
    };

    return (
      <canvas
        ref={canvasRef}
        className="signature-surface"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
    );
  },
);
