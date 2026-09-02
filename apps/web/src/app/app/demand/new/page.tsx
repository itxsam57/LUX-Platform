import Link from "next/link";
import { DemandForm } from "@/components/demand/demand-form";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { requireAdultViewer } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

export default async function NewDemandPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const viewer = await requireAdultViewer("/app/demand/new");
  const { error } = await searchParams;

  return (
    <WorkspaceShell email={viewer.user.email ?? "Verified account"} context={viewer.context}>
      <div className="workspace-stack demand-page demand-page--narrow">
        <header className="workspace-page-header">
          <div>
            <span className="eyebrow">New crowd request</span>
            <h1>Create a demand</h1>
            <p>Describe the idea clearly. Creator references remain suggestions until the creator explicitly marks interest.</p>
          </div>
          <Link className="workspace-inline-link" href="/app/demand">Back to Demand Board</Link>
        </header>
        {error ? (
          <div className="demand-error" role="alert">
            {error === "invalid"
              ? "Check the demand fields and try again."
              : "The demand could not be published safely. Try again without assuming it was created."}
          </div>
        ) : null}
        <DemandForm />
      </div>
    </WorkspaceShell>
  );
}
