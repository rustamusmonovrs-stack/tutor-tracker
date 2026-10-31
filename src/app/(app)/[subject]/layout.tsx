import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { SubjectShell } from "@/components/subjects/SubjectShell";
import { isSubjectKey } from "@/lib/subjects/types";

// Only /math and /history exist. With dynamicParams off, any other /<word> is answered with a real HTTP 404
// (static routes such as /mock and /watch are matched first and are not affected).
export const dynamicParams = false;

export function generateStaticParams() {
  return [{ subject: "math" }, { subject: "history" }];
}

export default async function SubjectLayout({ children, params }: { children: ReactNode; params: Promise<{ subject: string }> }) {
  const { subject } = await params;
  if (!isSubjectKey(subject)) notFound();
  return <SubjectShell>{children}</SubjectShell>;
}
