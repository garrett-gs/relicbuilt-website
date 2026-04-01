export type PortalEvent =
  | "approval_sent"
  | "comment_sent"
  | "stage_changed"
  | "approval_response"
  | "client_comment";

export async function notifyPortal(opts: {
  event: PortalEvent;
  project_name: string;
  from_name: string;
  portal_url: string;
  message?: string;
  extra?: string;
  to_client?: boolean;
  client_email?: string;
  client_name?: string;
}) {
  try {
    await fetch("/api/notify-portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts),
    });
  } catch {
    // Notifications are best-effort — never block the main action
  }
}
