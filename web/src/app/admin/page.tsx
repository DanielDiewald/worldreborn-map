import Link from "next/link";
import { requireAdminSession } from "@/lib/auth/session";
import { listProjects } from "@/lib/projects";
import { createProjectAction } from "./actions";
import { AdminShell } from "@/components/admin/admin-shell";

function plainText(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export default async function AdminDashboardPage() {
  await requireAdminSession();
  const projects = await listProjects();

  return (
    <AdminShell section="projects" eyebrow="Administration" title="Welten & Projekte">
      <div className="page-heading">
        <div>
          <span className="page-kicker">WORLD ARCHIVE</span>
          <h1>Welche Welt möchtest du verwalten?</h1>
          <p>Jede Welt ist vollständig getrennt. Wähle ein Projekt, um Dashboard, NPCs und weitere Inhalte zu öffnen.</p>
        </div>
        <span className="summary-chip"><strong>{projects.length}</strong> Welten</span>
      </div>

      <section className="project-grid">
        {projects.map((project) => (
          <Link key={project.id} className="world-card" href={`/admin/projects/${project.id}`}>
            <div className="world-card-cover">
              {project.image && project.image !== "noimage" ? <img src={project.image} alt="" /> : <div className="world-card-monogram">{project.name.slice(0, 1).toUpperCase()}</div>}
              <span className={`status-pill ${project.status === "active" ? "active" : ""}`}>{project.status}</span>
            </div>
            <div className="world-card-body">
              <div>
                <span className="world-id">WORLD #{project.id}</span>
                <h2>{project.name}</h2>
              </div>
              <p>{plainText(project.description) || "Noch keine Beschreibung hinterlegt."}</p>
              <div className="world-card-footer">
                <span>{project.id === 1 ? "Legacy-Karte verbunden" : "Eigenständige Welt"}</span>
                <span className="arrow-button">→</span>
              </div>
            </div>
          </Link>
        ))}
      </section>

      <details className="create-panel">
        <summary><span>＋</span> Neue Welt anlegen</summary>
        <div className="create-panel-body">
          <form action={createProjectAction} className="stack">
            <div className="field-grid two">
              <label>Projektname<input name="name" maxLength={100} placeholder="z. B. Neue Testwelt" required /></label>
              <label>Status<input value="active" readOnly /></label>
            </div>
            <label>Beschreibung<textarea name="description" maxLength={20000} placeholder="Worum geht es in dieser Welt?" /></label>
            <div><button className="primary" type="submit">Welt erstellen</button></div>
          </form>
        </div>
      </details>
    </AdminShell>
  );
}
