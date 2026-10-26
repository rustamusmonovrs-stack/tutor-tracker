"use client";

import type { ReactNode } from "react";
import { DataProvider } from "@/lib/data";
import { HomeworkProvider } from "@/lib/homeworkData";
import { StagesProvider } from "@/lib/stagesData";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { AppShell } from "@/components/AppShell";
import { SetupNotice } from "@/components/SetupNotice";

export default function AppLayout({ children }: { children: ReactNode }) {
  if (!isSupabaseConfigured()) return <SetupNotice />;
  return (
    <DataProvider>
      <StagesProvider>
        <HomeworkProvider>
          <AppShell>{children}</AppShell>
        </HomeworkProvider>
      </StagesProvider>
    </DataProvider>
  );
}
