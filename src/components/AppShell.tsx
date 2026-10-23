"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { IconPeople, IconRank, IconToday } from "@/components/icons";
import { useData } from "@/lib/data";

const LINKS = [
  { href: "/", label: "Today", icon: IconToday },
  { href: "/leaderboard", label: "Leaderboard", icon: IconRank },
  { href: "/students", label: "Students", icon: IconPeople },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { status, error, reload, toast, dismissToast } = useData();

  return (
    <div className="shell">
      <nav className="nav" aria-label="Main">
        <div className="nav__brand">Jurnal</div>
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link key={href} href={href} className="nav__link" aria-current={active ? "page" : undefined}>
              <Icon />
              {label}
            </Link>
          );
        })}
      </nav>

      <main className="main">
        {status === "loading" && (
          <div className="stack" aria-busy="true" aria-label="Loading">
            <div className="skeleton" />
            <div className="skeleton" />
          </div>
        )}

        {status === "error" && (
          <div className="sheet sheet--pad stack" role="alert">
            <div>
              <h1 className="page-title" style={{ fontSize: "1.35rem" }}>
                Ma&apos;lumotlar yuklanmadi
              </h1>
              <p className="hint" style={{ marginTop: 6 }}>
                {error}
              </p>
              <p className="hint" style={{ marginTop: 6 }}>
                If this says a table does not exist, run <code>supabase/schema.sql</code> in the
                Supabase SQL Editor. Otherwise check your connection and try again.
              </p>
            </div>
            <div>
              <button className="btn btn--primary" onClick={() => void reload()}>
                Try again
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
