import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { sendMessageAction } from "../actions";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { Button, Status, Textarea } from "@/components/ui/primitives";
import { requireAdultViewer } from "@/lib/auth/context";
import { parseMessageThread, parseMessageThreadId } from "@/lib/consumer/policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatTime(value: string) {
  return new Date(value).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" });
}

export default async function MessageThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { publicId: rawId } = await params;
  const publicId = parseMessageThreadId(rawId);
  if (!publicId) notFound();

  const viewer = await requireAdultViewer(`/messages/${publicId}`);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_message_thread", {
    requested_thread_public_id: publicId,
  });
  const thread = error ? null : parseMessageThread(data);
  if (!thread) notFound();

  await supabase.rpc("mark_message_thread_read", { requested_thread_public_id: publicId });
  const query = await searchParams;
  const actionError = first(query.error);
  const notice = first(query.notice);

  return (
    <WorkspaceShell email={viewer.user.email ?? "Verified account"} context={viewer.context}>
      <div className="workspace-stack">
        <header className="workspace-page-header">
          <div>
            <span className="eyebrow">Private conversation</span>
            <h1>{thread.otherDisplayName}</h1>
            <p><Link href={`/u/${thread.otherHandle}`}>@{thread.otherHandle}</Link> · <Link href="/messages">Back to messages</Link></p>
          </div>
          <Status label="Private thread" tone="info" />
        </header>

        {notice ? <div className="auth-message auth-message--success" role="status">Message sent.</div> : null}
        {actionError ? <div className="auth-message auth-message--error" role="alert">The message could not be sent.</div> : null}

        <section className="workspace-stack" aria-label="Conversation history">
          {thread.messages.length ? thread.messages.map((message) => (
            <article className="ui-card" key={message.publicId}>
              <div className="workspace-page-header">
                <strong>{message.mine ? "You" : message.sender}</strong>
                <small>{formatTime(message.createdAt)}</small>
              </div>
              <p>{message.body}</p>
            </article>
          )) : <div className="ui-state-card"><h2>No messages yet</h2><p>Send the first message in this conversation.</p></div>}
        </section>

        <section className="workspace-request-panel" aria-labelledby="send-message-heading">
          <div><span className="eyebrow">Reply</span><h2 id="send-message-heading">Send a message</h2><p>Messages persist privately and duplicate submissions are idempotent.</p></div>
          <form action={sendMessageAction} className="workspace-form-grid">
            <input type="hidden" name="thread_public_id" value={thread.publicId} />
            <input type="hidden" name="idempotency_key" value={`message:${randomUUID()}`} />
            <Textarea id="message-body" name="body" label="Message" minLength={1} maxLength={4000} rows={5} required />
            <Button type="submit">Send</Button>
          </form>
        </section>
      </div>
    </WorkspaceShell>
  );
}
