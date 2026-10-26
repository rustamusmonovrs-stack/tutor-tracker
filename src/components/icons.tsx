import type { SVGProps } from "react";
export {
  Award as IconAward,
  Upload as IconUpload,
  EyeOff as IconEyeOff,
  Globe as IconGlobe,
  CalendarCheck as IconToday,
  Trophy as IconRank,
  Users as IconPeople,
  ChartNoAxesColumn as IconStats,
  ChevronLeft as IconChevronLeft,
  ChevronRight as IconChevronRight,
  ChevronDown as IconChevronDown,
  ArrowUp as IconArrowUp,
  ArrowDown as IconArrowDown,
  Pencil as IconEdit,
  X as IconClose,
  Trash2 as IconTrash,
  Plus as IconPlus,
  Search as IconSearch,
  Archive as IconArchive,
  ArchiveRestore as IconRestore,
  LogOut as IconLogout,
  NotebookPen as IconTask,
  Check as IconCheck,
  UserCheck as IconPresent,
  UserX as IconAbsent,
  CircleCheck as IconHwFull,
  Contrast as IconHwPartial,
  CircleX as IconHwNone,
  History as IconHistory,
  Flame as IconStreak,
  Copy as IconCopy,
  CalendarDays as IconCalendar,
  BookOpen as IconBook,
  TriangleAlert as IconAlert,
  ClipboardCheck as IconMock,
  Lock as IconLock,
  GraduationCap as IconStages,
  Printer as IconPrint,
  Flag as IconFlag,
  ArrowRightLeft as IconTransfer,
} from "lucide-react";

/** Coin glyph (kept custom: lucide has no flat coin with a mark). */
export const IconCoin = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 20 20" aria-hidden focusable="false" {...p}>
    <circle cx="10" cy="10" r="8.5" fill="var(--coin)" />
    <circle cx="10" cy="10" r="6" fill="none" stroke="rgb(106 74 0 / 0.35)" strokeWidth="1.4" />
    <path
      d="M10 6.6v6.8M8.2 8.2c.4-.6 1-.9 1.8-.9 1 0 1.8.5 1.8 1.2 0 1.8-3.6.8-3.6 2.6 0 .8.8 1.3 1.8 1.3.8 0 1.4-.3 1.8-.9"
      fill="none"
      stroke="rgb(106 74 0 / 0.75)"
      strokeWidth="1.1"
      strokeLinecap="round"
    />
  </svg>
);

export { ClipboardList as IconWatch } from "lucide-react";
