import type { ReactNode, SVGProps } from "react";
import type { LessonResult } from "@/lib/types";

/** One consistent stroke icon family (24px grid, 1.75 stroke, round joins). */
function Svg({ children, ...rest }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

type P = SVGProps<SVGSVGElement>;

export const IconToday = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="3.2" />
    <path d="M8 3.2v3.6M16 3.2v3.6M3.5 10h17" />
    <path d="m9 15 2 2 4-4.2" />
  </Svg>
);

export const IconRank = (p: P) => (
  <Svg {...p}>
    <path d="M8 21h8M12 17v4" />
    <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
    <path d="M7 6H4.5a1 1 0 0 0-1 1 3.5 3.5 0 0 0 3.5 3.5M17 6h2.5a1 1 0 0 1 1 1 3.5 3.5 0 0 1-3.5 3.5" />
  </Svg>
);

export const IconPeople = (p: P) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.3" />
    <path d="M2.8 20c.5-3.4 3-5.4 6.2-5.4s5.7 2 6.2 5.4" />
    <path d="M15.6 4.9a3.3 3.3 0 0 1 0 6.2M18 14.9c1.7.7 2.8 2.3 3.2 5.1" />
  </Svg>
);

export const IconChevronLeft = (p: P) => (
  <Svg {...p}>
    <path d="m14.5 6-6 6 6 6" />
  </Svg>
);

export const IconChevronRight = (p: P) => (
  <Svg {...p}>
    <path d="m9.5 6 6 6-6 6" />
  </Svg>
);

export const IconArrowUp = (p: P) => (
  <Svg {...p}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Svg>
);

export const IconArrowDown = (p: P) => (
  <Svg {...p}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Svg>
);

export const IconEdit = (p: P) => (
  <Svg {...p}>
    <path d="M4 20h4L19.2 8.8a2.1 2.1 0 0 0-3-3L5 17v3Z" />
    <path d="m14 7 3 3" />
  </Svg>
);

export const IconClose = (p: P) => (
  <Svg {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Svg>
);

export const IconTrash = (p: P) => (
  <Svg {...p}>
    <path d="M4 7h16M10 11v6M14 11v6" />
    <path d="M6 7l.8 11.2A2 2 0 0 0 8.8 20h6.4a2 2 0 0 0 2-1.8L18 7M9 7V4.8A.8.8 0 0 1 9.8 4h4.4a.8.8 0 0 1 .8.8V7" />
  </Svg>
);

export const IconPlus = (p: P) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconSearch = (p: P) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </Svg>
);

export const IconArchive = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="4.5" width="17" height="4.5" rx="1.6" />
    <path d="M5.5 9v8.5a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V9M10 13h4" />
  </Svg>
);

export const IconRestore = (p: P) => (
  <Svg {...p}>
    <path d="M4 12a8 8 0 1 0 2.6-5.9M4 4.5V9h4.5" />
  </Svg>
);

export const IconLogout = (p: P) => (
  <Svg {...p}>
    <path d="M14 4h3.5A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5H14M10 8l-4 4 4 4M6 12h10" />
  </Svg>
);

export const IconTask = (p: P) => (
  <Svg {...p}>
    <rect x="5" y="4" width="14" height="17" rx="2.6" />
    <path d="M9 4V3h6v1M9 11h6M9 15h4" />
  </Svg>
);

export const IconCoin = (p: P) => (
  <svg viewBox="0 0 20 20" aria-hidden focusable="false" {...p}>
    <circle cx="10" cy="10" r="8.5" fill="var(--coin)" />
    <circle cx="10" cy="10" r="6" fill="none" stroke="rgb(106 74 0 / 0.35)" strokeWidth="1.4" />
    <path d="M10 6.6v6.8M8.2 8.2c.4-.6 1-.9 1.8-.9 1 0 1.8.5 1.8 1.2 0 1.8-3.6.8-3.6 2.6 0 .8.8 1.3 1.8 1.3.8 0 1.4-.3 1.8-.9" fill="none" stroke="rgb(106 74 0 / 0.75)" strokeWidth="1.1" strokeLinecap="round" />
  </svg>
);

/** Result icons: each reads at 18px without its label. */
const RESULT_ICONS: Record<LessonResult, (p: P) => ReactNode> = {
  full: (p) => (
    <Svg {...p} className="res__icon res__icon--full">
      <circle cx="12" cy="12" r="8.6" />
      <path className="draw" d="m8.2 12.4 2.7 2.7 5-5.4" />
    </Svg>
  ),
  partial: (p) => (
    <Svg {...p} className="res__icon">
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 3.4a8.6 8.6 0 0 1 0 17.2Z" fill="currentColor" stroke="none" opacity=".9" />
    </Svg>
  ),
  not_done: (p) => (
    <Svg {...p} className="res__icon">
      <circle cx="12" cy="12" r="8.6" />
      <path d="m9 9 6 6M15 9l-6 6" />
    </Svg>
  ),
  not_understood: (p) => (
    <Svg {...p} className="res__icon">
      <circle cx="12" cy="12" r="8.6" />
      <path d="M9.7 9.6a2.4 2.4 0 1 1 3.4 2.2c-.7.4-1.1.9-1.1 1.7M12 16.6v.01" />
    </Svg>
  ),
  absent: (p) => (
    <Svg {...p} className="res__icon">
      <circle cx="12" cy="12" r="8.6" strokeDasharray="2.4 3.2" />
      <path d="M8.5 12h7" />
    </Svg>
  ),
};

export function ResultIcon({ result }: { result: LessonResult }) {
  return <>{RESULT_ICONS[result]({})}</>;
}
