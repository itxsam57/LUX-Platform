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
      <button className="demand-button demand-button--primary" type="submit">Publish demand</button>
    </form>
  );
}
