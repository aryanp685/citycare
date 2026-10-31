import Link from "next/link";
import type { Metadata } from "next";
import { LegalFooter } from "@/components/legal-footer";

export const metadata: Metadata = { title: "Legal" };

const NAV = [
  { href: "/legal/privacy", label: "Privacy notice" },
  { href: "/legal/terms", label: "Terms of use" },
  { href: "/legal/grievance", label: "Grievance & rights" },
  { href: "/legal/transparency", label: "Ledger transparency" },
  { href: "/legal/licenses", label: "Open-source licences" },
];

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <header className="bg-white border-b border-line">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <Link href="/" className="font-black tracking-tight no-underline text-ink">City<span className="text-brand">Care</span></Link>
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {NAV.map((n) => <Link key={n.href} href={n.href} className="text-muted hover:text-ink">{n.label}</Link>)}
          </nav>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-10 legal-prose">{children}</main>
      <LegalFooter />
    </div>
  );
}
