import Link from "next/link";

export default function NotFound() {
  return (
    <main className="shell">
      <section className="hero">
        <div className="badge">404</div>
        <h1>Not found.</h1>
        <p>The page you requested does not exist.</p>
        <Link className="retry" href="/">Return home</Link>
      </section>
    </main>
  );
}
