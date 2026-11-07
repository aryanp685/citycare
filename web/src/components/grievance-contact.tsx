import { grievanceContact } from "@/lib/grievance-contact";

/** Server-rendered public contact; no client-side configuration or editing endpoint. */
export function GrievanceContact() {
  const contact = grievanceContact(process.env);
  if (contact.status === "unavailable") {
    return <div className="callout"><strong>Grievance officer contact not yet published.</strong>{" "}
      The in-app grievance desk remains available to signed-in users. If you cannot sign in,
      an external contact is not currently published.</div>;
  }
  return <div><p><strong>Grievance Officer:</strong> {contact.officer}</p>
    <p><strong>Email:</strong> <a href={`mailto:${encodeURIComponent(contact.email).replace("%40", "@")}`}>{contact.email}</a></p></div>;
}
