import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Prism — Stripe Explorer",
  description: "A read-only advanced explorer for Stripe data.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
