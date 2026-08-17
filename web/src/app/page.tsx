import Link from "next/link";

export default function HomePage() {
  return (
    <main className="login-wrap">
      <section className="card login-card stack">
        <div>
          <div className="brand">WORLDREBORN</div>
          <h1>Worldbuilding control center</h1>
          <p className="muted">The legacy Aetheris data remains in PostgreSQL and is exposed through project-scoped server queries.</p>
        </div>
        <Link className="button primary" href="/admin/login">Admin login</Link>
      </section>
    </main>
  );
}
