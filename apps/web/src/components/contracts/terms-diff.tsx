export function TermsDiff({ terms }: { terms: Record<string, unknown> }) {
  const list = (value: unknown) => Array.isArray(value) ? value.map(String).join(", ") : "";
  const splits = Array.isArray(terms.revenueSplits)
    ? terms.revenueSplits.map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return "";
        const row = item as Record<string, unknown>;
        return `${String(row.handle ?? "")}: ${String(row.basisPoints ?? "")} bps`;
      }).filter(Boolean).join(", ")
    : "";
  return (
    <div className="contract-terms-grid">
      <div><strong>Role</strong><p>{String(terms.role ?? "")}</p></div>
      <div><strong>Boundaries</strong><p>{list(terms.boundaries)}</p></div>
      <div><strong>Collaborators</strong><p>{list(terms.collaborators)}</p></div>
      <div><strong>Compensation</strong><p>{String(terms.compensation ?? "")}</p></div>
      <div><strong>Revenue splits</strong><p>{splits}</p></div>
      <div><strong>Script hash</strong><p><code>{String(terms.scriptHash ?? "")}</code></p></div>
      <div><strong>Distribution</strong><p>{String(terms.distributionScope ?? "")}</p></div>
      <div><strong>Territory</strong><p>{String(terms.territory ?? "")}</p></div>
      <div><strong>Duration</strong><p>{String(terms.duration ?? "")}</p></div>
      <div><strong>Rights</strong><p>{String(terms.rightsScope ?? "")}</p></div>
      <div><strong>Schedule</strong><p>{String(terms.schedule ?? "")}</p></div>
      <div><strong>Cancellation</strong><p>{String(terms.cancellation ?? "")}</p></div>
      <div><strong>Withdrawal</strong><p>{String(terms.withdrawal ?? "")}</p></div>
      <div><strong>Dispute resolution</strong><p>{String(terms.disputeResolution ?? "")}</p></div>
    </div>
  );
}
