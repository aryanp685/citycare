import type { ReactNode } from "react";

/** Shared heading for role-specific workspaces. Actions must link to existing workflows. */
export function WorkspaceHeading({ eyebrow, title, description, actions }: {
  eyebrow: string; title: string; description: string; actions?: ReactNode;
}) {
  return <section className="workspace-heading">
    <div className="min-w-0">
      <p className="workspace-eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p className="workspace-description">{description}</p>
    </div>
    {actions && <div className="workspace-heading-actions">{actions}</div>}
  </section>;
}
