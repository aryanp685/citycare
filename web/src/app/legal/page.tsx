import Link from "next/link";
import { PRIVACY_NOTICE_VERSION, TERMS_VERSION } from "@/lib/legal";

export default function LegalIndex() {
  return (
    <div>
      <h1>Legal</h1>
      <p>Plain-language documents, written to be understood without a lawyer. Each has a version date; the version you accepted is stored on your account.</p>
      <ul>
        <li><Link href="/legal/privacy">Privacy notice</Link> — what we process, why, where, for how long, and your rights (v{PRIVACY_NOTICE_VERSION}).</li>
        <li><Link href="/legal/terms">Terms of use</Link> — what CityCare is and is not (v{TERMS_VERSION}).</li>
        <li><Link href="/legal/grievance">Grievance &amp; your rights</Link> — how to complain and how to exercise access, correction, erasure and nomination.</li>
        <li><Link href="/legal/transparency">Ledger transparency</Link> — the daily signed heads of the access ledger, the public key, and how to verify one yourself.</li>
        <li><Link href="/legal/licenses">Open-source licences</Link> — every third-party component shipped in this site, with its licence.</li>
      </ul>
    </div>
  );
}
