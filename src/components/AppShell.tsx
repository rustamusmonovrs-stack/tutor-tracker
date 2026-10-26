"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { IconMock, IconPeople, IconRank, IconStages, IconStats, IconToday } from "@/components/icons";
import { useData } from "@/lib/data";

const LINKS = [
  { href: "/", label: "Bugun", icon: IconToday },
  { href: "/mock", label: "Mock", icon: IconMock },
  { href: "/leaderboard", label: "Reyting", icon: IconRank },
  { href: "/students", label: "O'quvchilar", icon: IconPeople },
  { href: "/stages", label: "Bosqichlar", icon: IconStages },
  { href: "/stats", label: "Statistika", icon: IconStats },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { status, error, reload, toast, dismissToast } = useData();

  return (
    <div className="shell">
      <nav className="nav" aria-label="Main">
        <div className="nav__brand">
          <span className="nav__mark" aria-hidden>
            A
          </span>
          <span className="nav__name">
            Ark Progress
            <small>ARK Education</small>
          </span>
        </div>
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link key={href} href={href} className="nav__link" aria-current={active ? "page" : undefined}>
              <Icon aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>

      <main className="main">
        {status === "loading" && (
          <div className="stack" aria-busy="true" aria-label="Yuklanmoqda">
            <div className="skeleton" style={{ height: 48, width: "40%" }} />
            <div className="skeleton" />
            <div className="skeleton" style={{ height: 280 }} />
          </div>
        )}

        {status === "error" && (
          <div className="card card--pad stack" role="alert">
            <div>
              <h1 className="page-title" style={{ fontSize: "var(--fs-xl)" }}>
                Ma&apos;lumotlar yuklanmadi
              </h1>
              <p className="hint" style={{ marginTop: 6 }}>
                {error}
              </p>
              <p className="hint" style={{ marginTop: 6 }}>
                Agar jadval topilmadi degan xabar chiqsa, bazaga migratsiya hali qo&apos;llanmagan
                (<code>supabase/migrations</code>). Aks holda internetni tekshirib, qayta urinib ko&apos;ring.
              </p>
            </div>
            <div>
              <button className="btn btn--primary" onClick={() => void reload()}>
                Qayta urinish
              </button>
            </div>
          </div>
        )}

        {status === "ready" && children}
      </main>

      {toast && (
        <div className={`toast${toast.kind === "error" ? " toast--error" : ""}`} role="status" aria-live="polite">
          <span>{toast.message}</span>
          {toast.action && (
            <button
              className="toast__action"
              onClick={() => {
                toast.action?.run();
                dismissToast();
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
