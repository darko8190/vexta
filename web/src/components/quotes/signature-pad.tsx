"use client";

import { useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The ink, dark on the white of the pad in both themes: it is paper, and it prints. */
const INK = "#1e3a8a";

/**
 * A box to sign in with a finger, a stylus or the mouse. Reports the drawing as a PNG data URL
 * after each stroke, or null once cleared, so the form can wait for a signature.
 *
 * White in both themes on purpose: what is drawn here is printed on a white page, and a pad
 * that follows dark mode would have the client sign in white ink.
 */
export function SignaturePad({
  onChange,
  className,
  label = "Signez dans le cadre",
}: {
  onChange: (dataUrl: string | null) => void;
  className?: string;
  label?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  // Sized to the box at the screen's density, so the stroke is crisp on a phone and the PNG
  // stays a few kilobytes. Done on the first touch of an empty pad rather than on mount: a
  // dialog opens with a zoom, and a size measured mid-animation would put the ink beside the
  // finger.
  function fit(canvas: HTMLCanvasElement) {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 2.2;
    context.strokeStyle = INK;
    context.fillStyle = INK;
  }

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    event.preventDefault();
    if (empty) fit(event.currentTarget);
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    last.current = point(event);
    // A tap is a dot, not nothing.
    const context = event.currentTarget.getContext("2d");
    if (context && last.current) {
      context.beginPath();
      context.arc(last.current.x, last.current.y, 1.1, 0, Math.PI * 2);
      context.fill();
    }
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !last.current) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const next = point(event);
    context.beginPath();
    context.moveTo(last.current.x, last.current.y);
    context.lineTo(next.x, next.y);
    context.stroke();
    last.current = next;
  }

  function end(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    setEmpty(false);
    onChange(event.currentTarget.toDataURL("image/png"));
  }

  function clear() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.restore();
    setEmpty(true);
    onChange(null);
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="relative overflow-hidden rounded-lg border border-input bg-white">
        <canvas
          ref={canvasRef}
          aria-label={label}
          role="img"
          className="block h-36 w-full cursor-crosshair touch-none"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        />
        {empty && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-neutral-400">
            {label}
          </span>
        )}
        <div className="pointer-events-none absolute inset-x-6 bottom-7 border-b border-neutral-300" />
      </div>
      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={empty}>
          <Eraser />
          Effacer
        </Button>
      </div>
    </div>
  );
}

/** The signature the client drew, as the company and the client see it afterwards. */
export function DrawnSignature({ quoteId, className }: { quoteId: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a private PNG behind the API proxy
    <img
      src={`/api/proxy/soumissions/${quoteId}/signature`}
      alt="Signature du client"
      className={cn("h-16 w-auto rounded-md border border-border bg-white p-1", className)}
    />
  );
}
