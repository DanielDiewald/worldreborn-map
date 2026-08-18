import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdminSession } from "@/lib/auth/session";
import { getFamilyTreeGraph, listFamilyTreePeople } from "@/lib/entities/family-trees";
import { getProject } from "@/lib/projects";
import { FamilyTreeCanvas } from "../family-tree-canvas";
import { addFamilyTreeMemberAction, refreshFamilyTreeAction } from "../actions";
import styles from "../family-trees.module.css";

export default async function FamilyTreeDetailPage({ params }: { params: Promise<{ projectId: string; treeId: string }> }) {
  await requireAdminSession();
  const raw = await params;
  const projectId = Number.parseInt(raw.projectId, 10);
  const treeRef = raw.treeId === "all" ? "all" as const : Number.parseInt(raw.treeId, 10);
  if (!Number.isSafeInteger(projectId) || projectId <= 0 || (treeRef !== "all" && (!Number.isSafeInteger(treeRef) || treeRef <= 0))) notFound();

  const [project, graph, peopleChoices] = await Promise.all([
    getProject(projectId),
    getFamilyTreeGraph(projectId, treeRef),
    listFamilyTreePeople(projectId),
  ]);
  if (!project || !graph) notFound();

  const rootPersonId = Number(graph.tree.root_person_id) || null;
  const named = treeRef !== "all";

  return (
    <AdminShell projectId={projectId} projectName={project.name} section="family-trees" eyebrow={`${project.name} / Stammbäume`} title={graph.tree.name || `Stammbaum #${treeRef}`}>
      <div className="breadcrumb"><Link href={`/admin/projects/${projectId}/family-trees`}>Stammbäume</Link><span>/</span><strong>{graph.tree.name || `Stammbaum #${treeRef}`}</strong></div>
      <div className="page-heading compact-heading">
        <div>
          <h1>{graph.tree.name || `Stammbaum #${treeRef}`}</h1>
          <p>{graph.tree.subtitle || graph.tree.description || "Genealogischer Stammbaum mit ältesten Generationen oben, fokussierter Hauptlinie und ausklappbaren Seitenzweigen."}</p>
        </div>
        <div className="heading-actions"><Link className="button" href={`/admin/projects/${projectId}/relationships`}>Beziehungen bearbeiten</Link></div>
      </div>

      {named ? (
        <div className={styles.toolbar}>
          <section className={`panel-card ${styles.toolCard}`}>
            <h2>Familienzweig synchronisieren</h2>
            <p>Übernimmt alle über Family-Relationships verbundenen Verwandten der Root-Person. Im Canvas bleibt zunächst nur die Hauptlinie offen; Seitenzweige können gezielt aufgeklappt werden.</p>
            <form action={refreshFamilyTreeAction.bind(null, projectId, treeRef)}><button className="primary">↻ Verbundene Familie ergänzen</button></form>
          </section>
          <section className={`panel-card ${styles.toolCard}`}>
            <h2>Person hinzufügen</h2>
            <form action={addFamilyTreeMemberAction.bind(null, projectId, treeRef)} className="stack">
              <select name="personId" required><option value="">Person wählen …</option>{peopleChoices.map((person) => <option key={person.person_id} value={person.person_id}>{person.name} · {person.kind}</option>)}</select>
              <div className="field-grid two"><input name="roleLabel" placeholder="Rolle im Tree" /><input name="branchLabel" placeholder="Branch / Linie" /></div>
              <button>Hinzufügen</button>
            </form>
          </section>
        </div>
      ) : null}

      <div className={styles.legend}>
        <span><i className={styles.mainLegend} /> Hauptlinie</span>
        <span><i /> Eltern / Kinder</span>
        <span><i className={styles.partner} /> Partner</span>
        <span>{graph.people.length} Personen · {graph.edges.length} Familienkanten</span>
        <span>Im Baum horizontal und vertikal scrollen</span>
      </div>

      {graph.people.length === 0 ? (
        <div className={`panel-card ${styles.empty}`}>Dieser Stammbaum enthält noch keine Personen.</div>
      ) : (
        <FamilyTreeCanvas
          projectId={projectId}
          people={graph.people}
          edges={graph.edges}
          rootPersonId={rootPersonId}
          named={named}
          treeId={treeRef}
        />
      )}
    </AdminShell>
  );
}
