import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "VipGroup Studio",
  description: "Outil interne VIP Group — Flipbooks",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="fr">
      <body className="min-h-screen font-sans text-foreground antialiased">{children}</body>
    </html>
  );
}
