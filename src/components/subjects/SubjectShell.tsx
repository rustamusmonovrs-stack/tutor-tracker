"use client";

import type { ReactNode } from "react";
import { SubjectProvider, useSubjectApi } from "@/lib/subjects/data";

function Gate({ children }: { children: ReactNode }) {
  const { status, error, reload } = useSubjectApi();
  if (status === "loading")
    return (
      <div className="stack" aria-busy="true" aria-label="Yuklanmoqda">
        <div className="skeleton" style={{ height: 48, width: "40%" }} />
        <div className="skeleton" style={{ height: 280 }} />
      </div>
    );
  if (status === "error")
    return (
      <div className="card card--pad stack" role="alert">
        <h1 className="page-title" style={{ fontSize: "var(--fs-xl)" }}>Ma&apos;lumotlar yuklanmadi</h1>
        <p className="hint">{error}</p>
        <div>
          <button className="btn btn--primary" onClick={() => void reload()}>Qayta urinish</button>
        </div>
      </div>
    );
  return <>{children}</>;
}

/** Loads Matematika / Tarix data on demand. The English providers above are not touched. */
export function SubjectShell({ children }: { children: ReactNode }) {
  return (
    <SubjectProvider>
      <Gate>{children}</Gate>
    </SubjectProvider>
  );
}
