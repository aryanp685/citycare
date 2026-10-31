import { all } from "@/lib/db";
import { Card, SectionTitle } from "@/components/ui";
import { Inbox, type InboxItem } from "@/components/inbox";

export async function InboxPage({ userId }: { userId: string }) {
  const rows = await all<Omit<InboxItem, "createdAt"> & { createdAt: Date }>(
    `SELECT id, title, body, href, severity, "isRead", "createdAt" FROM "Notification" WHERE "userId"=$1 ORDER BY "createdAt" DESC LIMIT 50`,
    [userId],
  );
  const items: InboxItem[] = rows.map((r) => ({ ...r, createdAt: new Date(r.createdAt).toISOString() }));
  return (
    <Card>
      <SectionTitle>Inbox</SectionTitle>
      <Inbox items={items} />
    </Card>
  );
}
