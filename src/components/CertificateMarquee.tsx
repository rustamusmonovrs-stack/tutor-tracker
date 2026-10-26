"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { IconChevronLeft, IconChevronRight, IconClose } from "@/components/icons";

export interface GalleryItem {
  id: string;
  url: string;
  /** Short accessible name, never personal data (e.g. "IELTS sertifikati"). */
  alt: string;
}

const GAP = 22; // space between cards
const FRAME = 11; // mat + border on each side
const SPEED = 46; // px per second: calm
const MARQUEE_MIN = 4; // fewer real certificates are shown as a static gallery (never padded with copies)

/** Natural width / height of every image, measured before anything is laid out (no layout jump when images arrive). */
function useRatios(items: GalleryItem[]) {
  const [ratios, setRatios] = useState<Record<string, number | null>>({});
  const key = items.map((i) => `${i.id}|${i.url}`).join(",");
  useEffect(() => {
    let alive = true;
    for (const it of items) {
      const img = new Image();
      img.onload = () => alive && setRatios((r) => ({ ...r, [it.id]: img.naturalWidth / Math.max(1, img.naturalHeight) }));
      img.onerror = () => alive && setRatios((r) => ({ ...r, [it.id]: null }));
      img.src = it.url;
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const ready = items.length > 0 && items.every((i) => i.id in ratios);
  const good = items.filter((i) => typeof ratios[i.id] === "number").map((i) => ({ ...i, ratio: ratios[i.id] as number }));
  return { ready, good };
}

export function CertificateMarquee({ items }: { items: GalleryItem[] }) {
  const { ready, good } = useRatios(items);
  const viewRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [open, setOpen] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [ready]);

  const marquee = good.length >= MARQUEE_MIN;
  const height = width && width < 640 ? 210 : 280;
  const cards = useMemo(
    () => good.map((g) => ({ ...g, w: Math.round((height - 2 * FRAME) * g.ratio + 2 * FRAME) })),
    [good, height],
  );
  const oneCopy = cards.reduce((sum, c) => sum + c.w + GAP, 0);
  // each group must be at least as wide as the viewport, otherwise a gap would show before the loop restarts
  const copies = marquee && width && oneCopy ? Math.max(1, Math.ceil(width / oneCopy)) : 1;
  const duration = Math.max(12, Math.round((oneCopy * copies) / SPEED));

  const card = (c: (typeof cards)[number], i: number, hidden: boolean) => (
    <li key={`${c.id}-${i}`} style={{ paddingRight: GAP }}>
      <button
        type="button"
        className="cm__card"
        style={{ width: c.w, height }}
        tabIndex={hidden ? -1 : 0}
        aria-label={`${c.alt} — kattalashtirish`}
        onClick={() => setOpen(cards.findIndex((x) => x.id === c.id))}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={c.url} alt={hidden ? "" : c.alt} draggable={false} />
      </button>
    </li>
  );

  if (!ready) return <div className="skeleton" style={{ height: 300 }} aria-busy="true" aria-label="Yuklanmoqda" />;
  if (!cards.length) return null;

  return (
    <div className={`cm${marquee ? "" : " cm--static"}${open !== null ? " is-paused" : ""}`} aria-roledescription={marquee ? "karusel" : undefined}>
      <div className="cm__viewport" ref={viewRef}>
        {marquee ? (
          <div className="cm__track" style={{ animationDuration: `${duration}s` }}>
            <ul className="cm__group" aria-label="Sertifikatlar">
              {Array.from({ length: copies }).flatMap((_, k) => cards.map((c, i) => card(c, k * cards.length + i, false)))}
            </ul>
            <ul className="cm__group cm__group--clone" aria-hidden="true">
              {Array.from({ length: copies }).flatMap((_, k) => cards.map((c, i) => card(c, k * cards.length + i, true)))}
            </ul>
          </div>
        ) : (
          <ul className="cm__static" aria-label="Sertifikatlar">
            {cards.map((c, i) => card(c, i, false))}
          </ul>
        )}
      </div>
      <Lightbox items={cards} index={open} onIndex={setOpen} />
    </div>
  );
}

function Lightbox({ items, index, onIndex }: { items: GalleryItem[]; index: number | null; onIndex: (i: number | null) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const saved = useRef(0);

  const unlock = useCallback(() => {
    document.documentElement.style.overflow = "";
    document.body.style.paddingRight = "";
    window.scrollTo(0, saved.current);
  }, []);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (index !== null && !d.open) {
      saved.current = window.scrollY;
      const bar = window.innerWidth - document.documentElement.clientWidth;
      document.documentElement.style.overflow = "hidden";
      if (bar > 0) document.body.style.paddingRight = `${bar}px`; // no sideways jump when the scrollbar disappears
      d.showModal();
    } else if (index === null && d.open) {
      d.close();
    }
  }, [index]);

  // always restore the page, however the dialog was closed (Esc, backdrop, button, unmount)
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onClose = () => {
      unlock();
      onIndex(null);
    };
    d.addEventListener("close", onClose);
    return () => {
      d.removeEventListener("close", onClose);
      if (d.open) d.close();
    };
  }, [unlock, onIndex]);

  const go = (delta: number) => onIndex(index === null ? null : (index + delta + items.length) % items.length);
  const current = index !== null ? items[index] : null;

  return (
    <dialog
      ref={ref}
      className="lightbox"
      aria-label="Sertifikat"
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(1);
        if (e.key === "ArrowLeft") go(-1);
      }}
    >
      {current && (
        <div className="lightbox__stage" onClick={(e) => e.target === e.currentTarget && ref.current?.close()}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={current.url} alt={current.alt} />
        </div>
      )}
      <button className="lightbox__close" aria-label="Yopish" onClick={() => ref.current?.close()}>
        <IconClose aria-hidden />
      </button>
      {items.length > 1 && (
        <>
          <button className="lightbox__nav lightbox__nav--prev" aria-label="Oldingi" onClick={() => go(-1)}>
            <IconChevronLeft aria-hidden />
          </button>
          <button className="lightbox__nav lightbox__nav--next" aria-label="Keyingi" onClick={() => go(1)}>
            <IconChevronRight aria-hidden />
          </button>
        </>
      )}
    </dialog>
  );
}
