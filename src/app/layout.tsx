import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "La Tua Pasta — Prospecting Tool",
  description: "UK restaurant prospecting and outreach tool for La Tua Pasta.",
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
