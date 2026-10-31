"use client";

import { Suspense } from "react";
import { SubjectStudents } from "@/components/subjects/SubjectStudents";

export default function SubjectStudentsPage() {
  // useSearchParams (profile deep links) needs a Suspense boundary for static rendering
  return (
    <Suspense fallback={<div className="skeleton" style={{ height: 280 }} aria-busy="true" />}>
      <SubjectStudents />
    </Suspense>
  );
}
