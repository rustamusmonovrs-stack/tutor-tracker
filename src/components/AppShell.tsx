"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { IconAward, IconMock, IconPeople, IconRank, IconStages, IconStats, IconToday, IconWatch } from "@/components/icons";
import { useData } from "@/lib/data";
import { useHomework } from "@/lib/homeworkData";

const LINKS = [
  { href: "/", label: "Bugun", icon: IconToday },
  { href: "/watch", label: "Nazorat ro'yxati", short: "Nazorat", icon: IconWatch },
  { href: "/mock", label: "Mock", icon: IconMock },
  { href: "/leaderboard", label: "Reyting", icon: IconRank },
  { href: "/students", label: "O'quvchilar", short: "O'quvchi", icon: IconPeople },
  { href: "/stages", label: "Bosqichlar", short: "Bosqich", icon: IconStages },
  { href: "/stats", label: "Statistika", short: "Stat.", icon: IconStats },
  { href: "/results", label: "Bizning natijalar", short: "Natijalar", icon: IconAward },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { status, error, reload, toast, dismissToast, activeStudents } = useData();
  const { cases } = useHomework();
  const watchCount = cases.filter((c) => c.status === "active" && activeStudents.some((s) => s.id === c.student_id)).length;

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
        {LINKS.map(({ href, label, icon: Icon, ...rest }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link key={href} href={href} className="nav__link" aria-current={active ? "page" : undefined}>
              <Icon aria-hidden />
              {"short" in rest ? (
                <>
                  <span className="nav__long">{label}</span>
                  <span className="nav__short" aria-hidden>{rest.short}</span>
                </>
              ) : (
                label
              )}
              {href === "/watch" && watchCount > 0 && (
                <span className="nav__badge" aria-label={`${watchCount} ta nazoratdagi o'quvchi`}>
                  {watchCount}
                </span>
              )}
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
