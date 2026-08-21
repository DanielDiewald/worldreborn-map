import Link from "next/link";
import { requireAdminSession } from "@/lib/auth/session";
import { listProjects } from "@/lib/projects";
import { AdminShell } from "@/components/admin/admin-shell";
import { ProjectCreateDialog } from "./project-create-dialog";

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
          <span className="page-kicker">WELTARCHIV</span>
          <h1>Welche Welt möchtest du verwalten?</h1>
          <p>Jede Welt ist vollständig getrennt. Wähle ein Projekt, um Dashboard, NPCs und weitere Inhalte zu öffnen.</p>
        </div>
        <div className="row"><span className="summary-chip"><strong>{projects.length}</strong> Welten</span><ProjectCreateDialog/></div>
      </div>

      <section className="project-grid">
        {projects.map((project) => (
          <Link key={project.id} className="world-card" href={`/admin/projects/${project.id}`}>
            <div className="world-card-cover">
              {project.image && project.image !== "noimage" ? <img src={project.image} alt="" /> : <div className="world-card-monogram">{project.name.slice(0, 1).toUpperCase()}</div>}
              <span className={`status-pill ${project.status === "active" ? "active" : ""}`}>{project.status === "active" ? "Aktiv" : project.status}</span>
            </div>
            <div className="world-card-body">
              <div>
                <span className="world-id">WELT #{project.id}</span>
                <h2>{project.name}</h2>
              </div>
              <p>{plainText(project.description) || "Noch keine Beschreibung hinterlegt."}</p>
              <div className="world-card-footer">
                <span>Eigenständige Welt</span>
                <span className="arrow-button">→</span>
              </div>
            </div>
          </Link>
        ))}
      </section>
    </AdminShell>
  );
}
