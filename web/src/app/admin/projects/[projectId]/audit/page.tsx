import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { listAuditLog } from "@/lib/audit";
import { requireAdminSession } from "@/lib/auth/session";
import { getProject } from "@/lib/projects";

type Search = Promise<{ action?: string; entityType?: string }>;

export default async function AuditPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Search }) {
  await requireAdminSession();
  const [{ projectId: rawProjectId }, search] = await Promise.all([params, searchParams]);
  const projectId = Number.parseInt(rawProjectId, 10);
  if (!Number.isSafeInteger(projectId) || projectId <= 0) notFound();
  const project = await getProject(projectId);
  if (!project) notFound();
  const entries = await listAuditLog(projectId, { action: search.action || undefined, entityType: search.entityType || undefined, limit: 200 });

  return (
    <AdminShell projectId={projectId} projectName={project.name} eyebrow={`${project.name} / System`} title="Audit Log">
      <div className="page-heading compact-heading">
        <div><div className="breadcrumb"><Link href={`/admin/projects/${projectId}`}>{project.name}</Link><span>/</span><strong>Audit Log</strong></div><h1>Änderungsprotokoll</h1><p>Sicherheitsrelevante Änderungen ohne Passwörter, vollständige Spielercodes oder Session-Tokens.</p></div>
      </div>
      <section className="panel-card">
        <form className="filter-bar" method="get">
          <input name="action" defaultValue={search.action ?? ""} placeholder="Aktion filtern …" />
          <input name="entityType" defaultValue={search.entityType ?? ""} placeholder="Entity-Typ …" />
          <button type="submit">Filtern</button>
        </form>
        {entries.length === 0 ? <div className="empty-state large"><strong>Keine Audit-Einträge</strong></div> : (
          <div className="table-scroll"><table className="entity-table"><thead><tr><th>Zeit</th><th>Akteur</th><th>Aktion</th><th>Entity</th><th>Metadaten</th></tr></thead><tbody>
            {entries.map((entry) => <tr key={entry.audit_id}><td>{entry.created_at.toLocaleString("de-DE")}</td><td>{entry.actor_type}{entry.actor_user_id ? ` #${entry.actor_user_id}` : ""}</td><td><code>{entry.action}</code></td><td>{entry.entity_type ? `${entry.entity_type} #${entry.entity_id ?? "?"}` : "—"}</td><td><code>{JSON.stringify(entry.metadata)}</code></td></tr>)}
          </tbody></table></div>
        )}
      </section>
    </AdminShell>
  );
}
