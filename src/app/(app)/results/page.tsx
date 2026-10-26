"use client";

import Link from "next/link";
import { useMemo } from "react";
import { CertificateMarquee } from "@/components/CertificateMarquee";
import { CertificatesAdmin } from "@/components/CertificatesAdmin";
import { IconGlobe } from "@/components/icons";
import { PUBLIC_BUCKET, kindLabel } from "@/lib/certificates";
import { useCertificates } from "@/lib/certificatesData";
import { getSupabase } from "@/lib/supabase/client";

export default function ResultsPage() {
  const api = useCertificates();
  const items = useMemo(
    () =>
      api.items
        .filter((c) => c.status === "published" && c.public_path)
        .map((c) => ({ id: c.id, url: getSupabase().storage.from(PUBLIC_BUCKET).getPublicUrl(c.public_path!).data.publicUrl, alt: `${kindLabel(c.kind)} sertifikati` })),
    [api.items],
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Bizning natijalar</h1>
          <p className="page-sub">ARK Education o‘quvchilarining haqiqiy IELTS va CEFR sertifikatlari</p>
        </div>
        <div className="page-actions">
          <Link className="btn" href="/natijalar" target="_blank" rel="noopener">
            <IconGlobe aria-hidden /> Ota-onalar sahifasi
          </Link>
        </div>
      </div>

      {api.status === "ready" && items.length > 0 ? (
        <CertificateMarquee items={items} />
      ) : api.status === "ready" ? (
        <div className="card empty" style={{ marginBottom: 16 }}>
          <strong>E‘lon qilingan sertifikat yo‘q</strong>
          <p>Sertifikat qo‘shib, e‘lon qilganingizdan so‘ng, u shu yerda va ota-onalar sahifasida ko‘rinadi.</p>
        </div>
      ) : null}

      <CertificatesAdmin api={api} />
    </>
  );
}
