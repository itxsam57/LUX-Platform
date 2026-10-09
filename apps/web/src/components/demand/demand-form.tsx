import { createDemandAction } from "@/app/demand/actions";

export function DemandForm() {
  return (
    <form action={createDemandAction} className="demand-form">
      <label>
        <span>Title</span>
        <input name="title" required minLength={4} maxLength={120} autoComplete="off" />
      </label>
      <label>
        <span>Brief</span>
        <textarea name="brief" required minLength={20} maxLength={1200} rows={7} />
      </label>
      <div className="demand-form__grid">
        <label>
          <span>Category</span>
          <input name="category" required maxLength={48} autoComplete="off" placeholder="creator_idea" />
        </label>
        <label>
          <span>Format</span>
          <input name="format" required maxLength={48} autoComplete="off" placeholder="short_film" />
        </label>
      </div>
      <label>
        <span>Suggested creator handle</span>
        <input name="suggested_creator_handle" maxLength={30} autoComplete="off" placeholder="optional_creator" />
        <small>Suggestion only. Naming a creator does not create commitment, consent, or a contract.</small>
      </label>
      <label>
        <span>Script / outline</span>
        <textarea name="script_outline" minLength={20} maxLength={4000} rows={6} placeholder="Optional scene, story, or production outline. This is a request, not performer consent." />
      </label>
      <div className="demand-form__grid">
        <label><span>Budget minimum (minor units)</span><input name="budget_min_minor" type="number" min={0} step={1} /></label>
        <label><span>Budget maximum (minor units)</span><input name="budget_max_minor" type="number" min={0} step={1} /></label>
        <label><span>Currency</span><input name="budget_currency" minLength={3} maxLength={3} placeholder="USD" /></label>
      </div>
      <label>
        <span>Safety / boundary labels</span>
        <input name="safety_labels" maxLength={260} placeholder="closed_set, no_surprises" />
        <small>Comma-separated labels. These describe requested safety boundaries; creators and performers still decide their own limits.</small>
      </label>
      <label>
        <span>Expires at</span>
        <input name="expires_at" type="datetime-local" />
      </label>
      <button className="demand-button demand-button--primary" type="submit">Publish demand</button>
    </form>
  );
}
