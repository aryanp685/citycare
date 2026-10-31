import { viewerForPage } from "@/lib/session";
import { InboxPage } from "@/components/inbox-page";

export const dynamic = "force-dynamic";

export default async function Page() {
  const v = await viewerForPage(["SUPER_ADMIN", "HOSPITAL_ADMIN"]);
  return <InboxPage userId={v.uid} />;
}
