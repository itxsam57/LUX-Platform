export default function Loading() {
  return (
    <main className="route-state" aria-busy="true" aria-live="polite">
      <span className="eyebrow">Loading</span>
      <div className="route-loading">
        <span className="ui-skeleton" style={{ width: "35%", height: 14 }} aria-hidden="true" />
        <span className="ui-skeleton" style={{ width: "78%", height: 44 }} aria-hidden="true" />
        <span className="ui-skeleton" style={{ width: "100%", height: 14 }} aria-hidden="true" />
        <span className="ui-skeleton" style={{ width: "70%", height: 14 }} aria-hidden="true" />
      </div>
      <span className="sr-only">Loading route</span>
    </main>
  );
}
