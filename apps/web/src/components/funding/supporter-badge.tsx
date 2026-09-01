type SupporterBadgeProps = {
  commitmentPublicId: string;
  badge: { key: string; visibility: "public" | "private" | "hidden" } | null;
  action: (formData: FormData) => Promise<void>;
};

export function SupporterBadge({ commitmentPublicId, badge, action }: SupporterBadgeProps) {
  return (
    <section className="studio-card funding-badge-panel">
      <h2>Supporter badge</h2>
      <p>Choose whether this campaign badge may be shown publicly. Hidden and private choices stay out of public supporter attribution.</p>
      {badge ? <p className="funding-current-badge">Current badge: <strong>{badge.key}</strong> · {badge.visibility} badge</p> : <p>No supporter badge is currently set.</p>}
      <form action={action} className="studio-form studio-form--compact">
        <input type="hidden" name="commitment_public_id" value={commitmentPublicId} />
        <label>
          Supporter badge
          <input name="badge_key" defaultValue={badge?.key ?? ""} minLength={2} maxLength={64} required />
        </label>
        <label>
          Badge visibility
          <select name="visibility" defaultValue={badge?.visibility ?? "private"}>
            <option value="public">Public badge</option>
            <option value="private">Private badge</option>
            <option value="hidden">Hidden badge</option>
          </select>
        </label>
        <button className="studio-button studio-button--primary" type="submit">Save badge</button>
      </form>
    </section>
  );
}
