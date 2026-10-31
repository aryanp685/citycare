import Link from "next/link";
import { PRIVACY_NOTICE_VERSION } from "@/lib/legal";

/** Every authenticated shell and the landing page carry the same legal links (DPDP Rules r.3: the notice must be reachable independently). */
export function LegalFooter({ compact = false }: { compact?: boolean }) {
  return (
    <footer className={`text-xs text-muted ${compact ? "py-6" : "py-8 border-t border-line mt-10"}`}>
      <div className="max-w-6xl mx-auto px-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span>© {new Date().getFullYear()} CityCare · student project, non-commercial</span>
        <Link href="/legal/privacy" className="hover:text-ink">Privacy notice v{PRIVACY_NOTICE_VERSION}</Link>
        <Link href="/legal/terms" className="hover:text-ink">Terms</Link>
        <Link href="/legal/grievance" className="hover:text-ink">Grievance &amp; your rights</Link>
        <Link href="/legal/licenses" className="hover:text-ink">Open-source licences</Link>
        <span className="ml-auto">Not medical advice · emergencies: call 108 / 112</span>
      </div>
    </footer>
  );
}
