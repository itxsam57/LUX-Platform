"use client";

export default function ErrorBoundary({ reset }: { reset: () => void }) {
  return (
    <main className="route-state">
      <span className="eyebrow">Controlled error</span>
      <h1>Something went wrong</h1>
      <p className="lede">The page failed safely. Retry without losing the route context.</p>
      <div>
        <button className="ui-button ui-button--primary ui-button--medium" type="button" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
