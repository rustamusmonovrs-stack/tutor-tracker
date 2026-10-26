"use client";

import { useEffect, useRef, useState } from "react";
import { RedactEditor } from "@/components/RedactEditor";
import { IconArchive, IconEdit, IconEyeOff, IconGlobe, IconPlus, IconRestore, IconTrash, IconUpload } from "@/components/icons";
import { FormDialog } from "@/components/ui";
import { useData } from "@/lib/data";
import { formatDate } from "@/lib/dates";
import { ALLOWED_TYPES, CERT_KINDS, MAX_UPLOAD_BYTES, flattenRedacted, kindLabel, loadImage, type CertKind, type Certificate, type RedactBox } from "@/lib/certificates";
import { useCertificates } from "@/lib/certificatesData";

type Api = ReturnType<typeof useCertificates>;

const STATUS: Record<Certificate["status"], { label: string; cls: string }> = {
  draft: { label: "Qoralama", cls: "" },
  published: { label: "E‘lon qilingan", cls: "chip--ok" },
  archived: { label: "Arxiv", cls: "" },
};

export function CertificatesAdmin({ api }: { api: Api }) {
  const { items, status, error, reload } = api;
  const [editing, setEditing] = useState<{ cert: Certificate | null } | null>(null);
  const [publishing, setPublishing] = useState<Certificate | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const live = items.filter((c) => c.status !== "archived");
  const archived = items.filter((c) => c.status === "archived");

  return (
    <section className="stack" aria-label="Sertifikatlarni boshqarish">
      <div className="curr-head">
        <div>
          <h2 className="section-title" style={{ margin: 0 }}>Boshqaruv</h2>
          <p className="hint">Asl nusxa faqat sizga ko‘rinadi. Ommaga faqat maxfiy joylari yopilgan nusxa chiqadi.</p>
        </div>
        <button className="btn btn--primary btn--sm" onClick={() => setEditing({ cert: null })}>
          <IconPlus aria-hidden /> Sertifikat qo‘shish
        </button>
      </div>

      {status === "loading" && <div className="skeleton" style={{ height: 120 }} />}
      {status === "error" && (
        <div className="card card--pad stack" role="alert">
          <strong>Sertifikatlar yuklanmadi</strong>
          <p className="hint">{error}</p>
          <div><button className="btn btn--primary" onClick={() => void reload()}>Qayta urinish</button></div>
        </div>
      )}
      {status === "ready" && live.length === 0 && (
        <div className="card empty">
          <strong>Hali sertifikat qo‘shilmagan</strong>
          <p>Faqat haqiqiy, e’lon qilishga ruxsat berilgan IELTS/CEFR sertifikatlarini yuklang.</p>
        </div>
      )}
      {status === "ready" && live.length > 0 && (
        <ul className="certlist card">
          {live.map((c) => (
            <CertRow key={c.id} cert={c} api={api} onEdit={() => setEditing({ cert: c })} onPublish={() => setPublishing(c)} />
          ))}
        </ul>
      )}
      {archived.length > 0 && (
        <p className="hint">
          <button className="link-btn" onClick={() => setShowArchive((v) => !v)}>{showArchive ? "Arxivni yashirish" : `Arxiv (${archived.length})`}</button>
        </p>
      )}
      {showArchive && (
        <ul className="certlist card">
          {archived.map((c) => (
            <CertRow key={c.id} cert={c} api={api} onEdit={() => setEditing({ cert: c })} onPublish={() => setPublishing(c)} />
          ))}
        </ul>
      )}

      <CertDialog key={editing ? (editing.cert?.id ?? "new") : "closed"} open={editing !== null} cert={editing?.cert ?? null} api={api} onClose={() => setEditing(null)} />
      <PublishDialog key={publishing?.id ?? "none"} cert={publishing} api={api} onClose={() => setPublishing(null)} />
    </section>
  );
}

function Thumb({ cert, api }: { cert: Certificate; api: Api }) {
  const [url, setUrl] = useState<string | null>(null);
  const path = cert.redacted_path ?? cert.private_path;
  useEffect(() => {
    let alive = true;
    if (path) void api.signedUrl(path).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  return <span className="certlist__thumb">{url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={url} alt={`${kindLabel(cert.kind)} sertifikati (yopilgan nusxa)`} /> : null}</span>;
}

function CertRow({ cert, api, onEdit, onPublish }: { cert: Certificate; api: Api; onEdit: () => void; onPublish: () => void }) {
  const { notify } = useData();
  const st = STATUS[cert.status];
  const confirm = (text: string, run: () => Promise<boolean>) => {
    if (window.confirm(text)) void run();
  };
  return (
    <li className="certlist__row">
      <Thumb cert={cert} api={api} />
      <span className="certlist__main">
        <strong>{kindLabel(cert.kind)}</strong>
        <small className="hint">
          Qo‘shilgan: {formatDate(cert.created_at.slice(0, 10))}
          {cert.status === "published" && cert.published_at ? ` · e’lon: ${formatDate(cert.published_at.slice(0, 10))}` : ""}
          {cert.consent_note ? ` · rozilik: ${cert.consent_note}` : ""}
        </small>
      </span>
      <span className={`chip ${st.cls}`}>{st.label}</span>
      <span className="certlist__tools">
        {cert.status === "draft" && (
          <button className="btn btn--sm btn--primary" onClick={onPublish}>
            <IconGlobe aria-hidden /> E‘lon qilish
          </button>
        )}
        {cert.status === "published" && (
          <button className="btn btn--sm" onClick={() => confirm("Sertifikat ommaviy sahifadan olib tashlansinmi? Ommaviy fayl ham o‘chiriladi.", () => api.takeDown(cert, "draft"))}>
            <IconEyeOff aria-hidden /> Yashirish
          </button>
        )}
        {cert.status !== "archived" && (
          <>
            <button className="icon-btn icon-btn--bare" aria-label={`${kindLabel(cert.kind)}: tahrirlash`} title="Tahrirlash" onClick={onEdit}>
              <IconEdit aria-hidden />
            </button>
            <button
              className="icon-btn icon-btn--bare"
              aria-label={`${kindLabel(cert.kind)}: arxivlash`}
              title="Arxivlash"
              onClick={() => confirm(cert.status === "published" ? "Sertifikat arxivlanadi va ommaviy sahifadan olib tashlanadi." : "Sertifikat arxivlansinmi?", () => api.takeDown(cert, "archived"))}
            >
              <IconArchive aria-hidden />
            </button>
          </>
        )}
        {cert.status === "archived" && (
          <button className="icon-btn icon-btn--bare" aria-label={`${kindLabel(cert.kind)}: qaytarish`} title="Qoralamaga qaytarish" onClick={() => void api.restore(cert)}>
            <IconRestore aria-hidden />
          </button>
        )}
        <button
          className="icon-btn icon-btn--bare"
          style={{ color: "var(--bad)" }}
          aria-label={`${kindLabel(cert.kind)}: o‘chirish`}
          title="Butunlay o‘chirish"
          onClick={() => confirm("Sertifikat va uning barcha fayllari butunlay o‘chirilsinmi? Buni qaytarib bo‘lmaydi.", async () => {
            const ok = await api.remove(cert);
            if (ok) notify("Sertifikat o‘chirildi");
            return ok;
          })}
        >
          <IconTrash aria-hidden />
        </button>
      </span>
    </li>
  );
}

/** Upload (new) or edit (kind / redaction) a certificate. Always saved as a private draft first. */
function CertDialog({ open, cert, api, onClose }: { open: boolean; cert: Certificate | null; api: Api; onClose: () => void }) {
  const [kind, setKind] = useState<CertKind>(cert?.kind ?? "ielts");
  const [file, setFile] = useState<File | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [boxes, setBoxes] = useState<RedactBox[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const urlRef = useRef<string | null>(null);
  const locked = cert?.status === "published";

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  // editing: load the stored original so the covers can be redrawn
  useEffect(() => {
    if (!open || !cert?.private_path) return;
    let alive = true;
    void (async () => {
      const u = await api.signedUrl(cert.private_path!);
      if (!u || !alive) return;
      try {
        const blob = await (await fetch(u)).blob();
        if (!alive) return;
        urlRef.current = URL.createObjectURL(blob);
        setSrc(urlRef.current);
      } catch {
        setErr("Asl nusxa yuklanmadi.");
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cert?.id]);

  function pick(f: File | null) {
    setErr(null);
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setSrc(null);
    setBoxes([]);
    setFile(null);
    if (!f) return;
    if (!ALLOWED_TYPES.includes(f.type)) return setErr("Faqat JPG, PNG yoki WebP rasm yuklang.");
    if (f.size > MAX_UPLOAD_BYTES) return setErr("Fayl 10 MB dan oshmasligi kerak.");
    setFile(f);
    urlRef.current = URL.createObjectURL(f);
    setSrc(urlRef.current);
  }

  const redrawing = Boolean(cert) && boxes.length > 0;
  const canSave = cert ? (!redrawing || (confirmed && !locked)) : Boolean(file && src && confirmed);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      let ok = true;
      if (cert) {
        if (cert.kind !== kind) ok = await api.setKind(cert.id, kind);
        if (ok && redrawing && src) ok = await api.replaceRedacted(cert, await flattenRedacted(await loadImage(src), boxes));
      } else if (file && src) {
        ok = await api.create(kind, file, await flattenRedacted(await loadImage(src), boxes));
      }
      if (ok) onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Saqlanmadi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDialog open={open} title={cert ? "Sertifikatni tahrirlash" : "Sertifikat qo‘shish"} submitLabel="Saqlash" canSubmit={canSave} busy={busy} onSubmit={() => void save()} onCancel={onClose}>
      <div className="seg" role="group" aria-label="Sertifikat turi">
        {CERT_KINDS.map((k) => (
          <button key={k.id} type="button" className="seg__btn" aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>
            {k.label}
          </button>
        ))}
      </div>

      {!cert && (
        <label className="field">
          <span className="field__label">Sertifikat rasmi (JPG, PNG, WebP · 10 MB gacha)</span>
          <span className="filepick">
            <IconUpload aria-hidden />
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          </span>
        </label>
      )}
      {locked && <p className="callout" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>Sertifikat e‘lon qilingan: yopilgan nusxani o‘zgartirish uchun avval “Yashirish”ni bosing.</p>}

      {src && !locked && (
        <>
          <RedactEditor src={src} boxes={boxes} onChange={setBoxes} />
          <label className="check">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            Candidate number, shaxsiy ID/pasport, tug‘ilgan sana, QR va tekshirish kodlari yopilganini (yoki rasmda yo‘qligini) tasdiqlayman.
          </label>
        </>
      )}
      {err && <p className="form-error" role="alert">{err}</p>}
      <p className="hint">Saqlangandan so‘ng sertifikat “Qoralama” bo‘ladi va ommaga ko‘rinmaydi. E‘lon qilish alohida qadam.</p>
    </FormDialog>
  );
}

function PublishDialog({ cert, api, onClose }: { cert: Certificate | null; api: Api; onClose: () => void }) {
  const [consent, setConsent] = useState(false);
  const [checked, setChecked] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (cert?.redacted_path) void api.signedUrl(cert.redacted_path).then((u) => alive && setPreview(u));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cert?.id]);

  return (
    <FormDialog
      open={cert !== null}
      title="Ommaviy e‘lon qilish"
      submitLabel="E‘lon qilish"
      canSubmit={consent && checked}
      busy={busy}
      onSubmit={async () => {
        if (!cert) return;
        setBusy(true);
        const ok = await api.publish(cert, note);
        setBusy(false);
        if (ok) onClose();
      }}
      onCancel={onClose}
    >
      <p className="hint">Ommaga faqat quyidagi yopilgan nusxa chiqadi (/natijalar sahifasida):</p>
      {preview && /* eslint-disable-next-line @next/next/no-img-element */ <img className="publish-prev" src={preview} alt="Ommaviy nusxa" />}
      <label className="check">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        Ko‘rib chiqdim: maxfiy ma’lumotlar (candidate number, ID, tug‘ilgan sana, QR) ko‘rinmaydi.
      </label>
      <label className="check">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        Sertifikat egasidan (yoki ota-onasidan) e‘lon qilishga rozilik olingan.
      </label>
      <label className="field">
        <span className="field__label">Rozilik izohi (ixtiyoriy, faqat sizga ko‘rinadi)</span>
        <input className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Masalan: ota-onasi bilan og‘zaki kelishilgan, 26.10.2026" />
      </label>
    </FormDialog>
  );
}
