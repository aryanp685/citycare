import { viewerForPage } from "@/lib/session";
import { InboxPage } from "@/components/inbox-page";

export const dynamic = "force-dynamic";

export default async function Page() {
  const v = await viewerForPage("PATIENT");
  return <InboxPage userId={v.uid} />;
}
