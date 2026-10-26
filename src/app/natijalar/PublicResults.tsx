"use client";

import { useCallback, useEffect, useState } from "react";
import { CertificateMarquee, type GalleryItem } from "@/components/CertificateMarquee";
import { PUBLIC_BUCKET, kindLabel } from "@/lib/certificates";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";

/** Read-only parents page. No sidebar, no student/teacher data: only the published, redacted images. */
export function PublicResults() {
  const [items, setItems] = useState<GalleryItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    if (!isSupabaseConfigured()) return setFailed(true);
    const sb = getSupabase();
    const { data, error } = await sb.rpc("public_certificates");
    if (error) return setFailed(true);
    setItems(
      ((data ?? []) as { id: string; kind: string; public_path: string }[]).map((c) => ({
        id: c.id,
        url: sb.storage.from(PUBLIC_BUCKET).getPublicUrl(c.public_path).data.publicUrl,
        alt: `${kindLabel(c.kind)} sertifikati`,
      })),
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="pub">
      <header className="pub__head">
        <span className="nav__mark" aria-hidden>A</span>
        <span className="pub__brand">
          <strong>Ark Progress</strong>
          <small>ARK Education</small>
        </span>
      </header>
      <main className="pub__main">
        <h1 className="pub__title">Bizning natijalar</h1>
        <p className="pub__lead">O‘quvchilarimiz erishgan haqiqiy IELTS va CEFR sertifikatlari</p>

        {failed ? (
          <div className="pub__state" role="alert">
            <p>Sertifikatlar hozir yuklanmadi.</p>
            <button className="btn" onClick={() => void load()}>Qayta urinish</button>
          </div>
        ) : items === null ? (
          <div className="skeleton" style={{ height: 300 }} aria-busy="true" aria-label="Yuklanmoqda" />
        ) : items.length === 0 ? (
          <div className="pub__state">
            <p>Hozircha e’lon qilingan sertifikatlar yo‘q.</p>
          </div>
        ) : (
          <CertificateMarquee items={items} />
        )}
      </main>
      <footer className="pub__foot">Sertifikatlar egalarining roziligi bilan e’lon qilinadi; shaxsiy ma’lumotlar yashirilgan.</footer>
    </div>
  );
}
