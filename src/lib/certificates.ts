export type CertKind = "ielts" | "cefr";
export type CertStatus = "draft" | "published" | "archived";

/** Official certificate types. Adding another type later = one more entry here + the DB check constraint. */
export const CERT_KINDS: { id: CertKind; label: string }[] = [
  { id: "ielts", label: "IELTS" },
  { id: "cefr", label: "CEFR" },
];

export const PRIVATE_BUCKET = "certificates-private";
export const PUBLIC_BUCKET = "certificates-public";
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export interface Certificate {
  id: string;
  kind: CertKind;
  status: CertStatus;
  private_path: string | null;
  redacted_path: string | null;
  public_path: string | null;
  consent_at: string | null;
  consent_note: string | null;
  sort_order: number;
  published_at: string | null;
  created_at: string;
}

export function kindLabel(k: string): string {
  return CERT_KINDS.find((x) => x.id === k)?.label ?? k.toUpperCase();
}

/** Rectangle as fractions (0..1) of the image, so it is independent of the on-screen size. */
export interface RedactBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Rasm ochilmadi"));
    img.src = src;
  });
}

/**
 * Flatten the image with solid black boxes burned into the pixels and re-encode as a fresh JPEG.
 * Nothing underneath survives (no layers, no EXIF), so the public file cannot reveal the covered fields.
 */
export async function flattenRedacted(img: HTMLImageElement, boxes: RedactBox[], maxEdge = 2400): Promise<Blob> {
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Brauzer rasmni qayta ishlay olmadi");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  ctx.fillStyle = "#000000";
  for (const b of boxes) ctx.fillRect(Math.floor(b.x * w), Math.floor(b.y * h), Math.ceil(b.w * w) + 1, Math.ceil(b.h * h) + 1);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Rasm saqlanmadi"))), "image/jpeg", 0.9));
}

export function extOf(file: File): string {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}
