import Link from "next/link";

export default function NotFound() {
  return (
    <main className="route-state">
      <span className="eyebrow">404</span>
      <h1>Not found</h1>
      <p className="lede">This route does not exist or is not available in the current build slice.</p>
      <div>
        <Link className="ui-button ui-button--primary ui-button--medium" href="/">
          Return home
        </Link>
      </div>
    </main>
  );
}
