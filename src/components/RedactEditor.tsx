"use client";

import { useRef, useState } from "react";
import { IconClose } from "@/components/icons";
import type { RedactBox } from "@/lib/certificates";

/** Draw black boxes over private fields (candidate no., ID, date of birth, QR, verification codes). */
export function RedactEditor({ src, boxes, onChange }: { src: string; boxes: RedactBox[]; onChange: (b: RedactBox[]) => void }) {
  const stage = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<RedactBox | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  const point = (e: React.PointerEvent) => {
    const r = stage.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const rect = (a: { x: number; y: number }, b: { x: number; y: number }): RedactBox => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });

  return (
    <div className="rx">
      <div
        ref={stage}
        className="rx__stage"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest(".rx__del")) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          start.current = point(e);
          setDraft({ ...start.current, w: 0, h: 0 });
        }}
        onPointerMove={(e) => start.current && setDraft(rect(start.current, point(e)))}
        onPointerUp={(e) => {
          if (!start.current) return;
          const box = rect(start.current, point(e));
          start.current = null;
          setDraft(null);
          if (box.w > 0.01 && box.h > 0.01) onChange([...boxes, box]);
        }}
        onPointerCancel={() => {
          start.current = null;
          setDraft(null);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="Sertifikat nusxasi" draggable={false} />
        {[...boxes, ...(draft ? [draft] : [])].map((b, i) => (
          <span key={i} className="rx__box" style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }}>
            {i < boxes.length && (
              <button type="button" className="rx__del" aria-label="Qoplamani olib tashlash" onClick={() => onChange(boxes.filter((_, j) => j !== i))}>
                <IconClose aria-hidden />
              </button>
            )}
          </span>
        ))}
      </div>
      <div className="rx__bar">
        <span className="hint">Maxfiy joylar ustiga sichqoncha/barmoq bilan to‘rtburchak chizing ({boxes.length} ta qoplama).</span>
        <span>
          <button type="button" className="btn btn--sm" disabled={!boxes.length} onClick={() => onChange(boxes.slice(0, -1))}>Oxirgisini bekor qilish</button>{" "}
          <button type="button" className="btn btn--sm" disabled={!boxes.length} onClick={() => onChange([])}>Tozalash</button>
        </span>
      </div>
    </div>
  );
}
