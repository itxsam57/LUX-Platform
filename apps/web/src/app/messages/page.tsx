import Link from "next/link";
import { startDirectMessageAction } from "./actions";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { Button, Input, Status, Table } from "@/components/ui/primitives";
import { requireAdultViewer } from "@/lib/auth/context";
import { parseMessageThreadSummaries } from "@/lib/consumer/policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatTime(value: string | null) {
  if (!value) return "No messages yet";
  return new Date(value).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" });
}

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await requireAdultViewer("/messages");
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("list_my_message_threads");
  const threads = error ? [] : parseMessageThreadSummaries(data);
  const presetHandle = first(params.with)?.replace(/^@/,"") ?? "";
  const actionError = first(params.error);

  return (
    <WorkspaceShell email={viewer.user.email ?? "Verified account"} context={viewer.context}>
      <div className="workspace-stack">
        <header className="workspace-page-header">
          <div>
            <span className="eyebrow">Private adult messaging</span>
            <h1>Messages</h1>
            <p>Direct conversations are private to the two participants. Blocking either account closes message access and suppresses notifications.</p>
          </div>
          <Status label={error ? "Unavailable" : `${threads.length} conversation${threads.length === 1 ? "" : "s"}`} tone={error ? "danger" : "success"} />
        </header>

        {actionError || error ? <div className="auth-message auth-message--error" role="alert">The messaging action could not be completed safely.</div> : null}

        <section className="workspace-request-panel" aria-labelledby="new-message-heading">
          <div>
            <span className="eyebrow">Start a conversation</span>
            <h2 id="new-message-heading">Message a member</h2>
            <p>Enter an adult member&apos;s public handle. Existing conversations are reused instead of creating duplicates.</p>
          </div>
          <form action={startDirectMessageAction} className="workspace-form-grid">
            <Input id="message-handle" name="handle" label="Member handle" defaultValue={presetHandle} placeholder="creator_handle" minLength={3} maxLength={30} required />
            <Button type="submit">Open conversation</Button>
          </form>
        </section>

        {threads.length ? (
          <Table caption="Your private message threads">
            <thead><tr><th scope="col">Member</th><th scope="col">Latest message</th><th scope="col">Updated</th><th scope="col">Unread</th><th scope="col">Open</th></tr></thead>
            <tbody>{threads.map((thread) => (
              <tr key={thread.publicId}>
                <td><strong>{thread.otherDisplayName}</strong><br/><small>@{thread.otherHandle}</small></td>
                <td>{thread.lastMessage ?? "No messages yet"}</td>
                <td>{formatTime(thread.lastMessageAt)}</td>
                <td>{thread.unreadCount}</td>
                <td><Link href={thread.path}>Open</Link></td>
              </tr>
            ))}</tbody>
          </Table>
        ) : !error ? (
          <div className="ui-state-card"><h2>No conversations yet</h2><p>Start a private conversation with an available adult member.</p></div>
        ) : null}
      </div>
    </WorkspaceShell>
  );
}
