import Link from "next/link";
import { markAllNotificationsReadAction, markNotificationReadAction } from "./actions";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { Button, Status } from "@/components/ui/primitives";
import { requireAdultViewer } from "@/lib/auth/context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const viewer = await requireAdultViewer("/notifications");
  const supabase = await createServerSupabaseClient();
  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, type, target_path, read_at, created_at")
    .eq("recipient_user_id", viewer.user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  const unreadCount = notifications?.filter((item) => !item.read_at).length ?? 0;

  return (
    <WorkspaceShell email={viewer.user.email ?? "Verified account"} context={viewer.context}>
      <div className="workspace-stack">
        <header className="workspace-page-header">
          <div>
            <span className="eyebrow">Private notifications</span>
            <h1>Notifications</h1>
            <p>Only recipient-visible events are shown. Notifications from actors you block are suppressed by the database boundary.</p>
          </div>
          <Status label={`${unreadCount} unread`} tone={unreadCount ? "warning" : "success"} />
        </header>

        {unreadCount ? (
          <form action={markAllNotificationsReadAction} className="notification-toolbar">
            <Button type="submit" variant="secondary">Mark all as read</Button>
          </form>
        ) : null}

        <section className="notification-list" aria-label="Account notifications">
          {notifications?.length ? notifications.map((notification) => (
            <article className={`ui-card notification-card${notification.read_at ? " notification-card--read" : ""}`} key={notification.id}>
              <div>
                <span className="eyebrow">{notification.read_at ? "Read" : "New"}</span>
                <h2>{notification.type === "new_follower" ? "New follower" : "Account notification"}</h2>
                <p className="muted-copy">{new Date(notification.created_at).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" })}</p>
              </div>
              <div className="notification-actions">
                {notification.target_path ? <Link className="workspace-inline-link" href={notification.target_path}>Open profile</Link> : null}
                {!notification.read_at ? (
                  <form action={markNotificationReadAction}>
                    <input type="hidden" name="notification_id" value={notification.id} />
                    <Button type="submit" variant="quiet" size="small">Mark read</Button>
                  </form>
                ) : null}
              </div>
            </article>
          )) : (
            <div className="ui-card notification-card"><h2>No notifications yet</h2><p className="muted-copy">New follower events will appear here after the privacy boundary accepts them.</p></div>
          )}
        </section>
      </div>
    </WorkspaceShell>
  );
}
