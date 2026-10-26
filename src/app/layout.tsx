import type { Metadata, Viewport } from "next";
import "@fontsource-variable/onest";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Ark Progress", template: "%s · Ark Progress" },
  description: "ARK Education: lesson journal, attendance, mock exams and learning progress.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1f3a93",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz">
      <body>{children}</body>
    </html>
  );
}
