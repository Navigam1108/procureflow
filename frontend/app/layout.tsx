import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProcureFlow — Thoughtful purchasing",
  description:
    "A procurement agent workspace with policy checks, supplier comparisons, human approval, and reliable purchase orders.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
