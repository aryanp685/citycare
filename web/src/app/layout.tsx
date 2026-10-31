import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { DemoBanner } from "@/components/demo-banner";

// Self-hosted variable font: zero external requests (the sandboxed preview has no network,
// and a Google Fonts round-trip is the classic render-blocking regression on 3G in India).
const inter = localFont({
  src: "./fonts/InterVariable.woff2",
  variable: "--font-inter",
  display: "swap",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: { default: "CityCare — one health record for your whole city", template: "%s · CityCare" },
  description:
    "Patient-owned health record for Indian cities: one longitudinal record, consent-gated doctor access, a tamper-evident audit ledger and a deterministic safety rule engine.",
  applicationName: "CityCare",
};

export const viewport: Viewport = {
  themeColor: "#0f766e",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body><DemoBanner />{children}</body>
    </html>
  );
}
