"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
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

function svgProps() {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
}

function IconToday() {
  return (
    <svg {...svgProps()}>
      <rect x="4" y="5" width="16" height="15" rx="3" />
      <path d="M8 3v4M16 3v4M8.5 13.5l2.4 2.4 4.6-4.8" />
    </svg>
  );
}

function IconRank() {
  return (
    <svg {...svgProps()}>
      <path d="M5 20V12M12 20V5M19 20v-9" />
    </svg>
  );
}

function IconPeople() {
  return (
    <svg {...svgProps()}>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3.5 19c.5-3.2 2.7-5 5.5-5s5 1.8 5.5 5" />
      <path d="M16 5.6a3 3 0 0 1 0 5.8M17.5 14.3c1.7.6 2.7 2.3 3 4.7" />
    </svg>
  );
}
