import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { Pagination } from "@/components/pagination";
import { requireAdminSession } from "@/lib/auth/session";
import { listFamilyTreesPaginated } from "@/lib/entities/family-trees";
import { parsePagination } from "@/lib/pagination";
import { getProject } from "@/lib/projects";
import { FamilyTreeCreateDialog } from "./family-tree-create-dialog";
import styles from "./family-trees.module.css";

type Search=Promise<{page?:string;pageSize?:string;personId?:string}>;
function visibilityLabel(value:string){return value==="all_players"?"Alle Spieler":value==="selected_players"?"Ausgewählte Spieler":"Nur Admin";}

export default async function FamilyTreesPage({params,searchParams}:{params:Promise<{projectId:string}>;searchParams:Search}){
  await requireAdminSession();const [{projectId:raw},search]=await Promise.all([params,searchParams]);const projectId=Number.parseInt(raw,10);if(!Number.isSafeInteger(projectId)||projectId<=0)notFound();
  const pagination=parsePagination(search);const [project,trees]=await Promise.all([getProject(projectId),listFamilyTreesPaginated(projectId,pagination)]);if(!project)notFound();
  const path=`/admin/projects/${projectId}/family-trees`;
  return <AdminShell projectId={projectId} projectName={project.name} section="family-trees" eyebrow={`${project.name} / Wissen`} title="Stammbäume">
    <div className="page-heading compact-heading"><div><div className="breadcrumb"><Link href={`/admin/projects/${projectId}`}>{project.name}</Link><span>/</span><strong>Stammbäume</strong></div><h1>Familienlinien & Dynastien</h1><p>Benannte Stammbäume organisieren denselben kanonischen Familiengraphen. Personen bleiben intern <code>person + n_id</code>; Verwandtschaft wird nicht doppelt gespeichert.</p>{search.personId?<p className="notice">Person #{search.personId} kann nach dem Öffnen eines benannten Stammbaums über die serverseitige Personensuche ergänzt werden.</p>:null}</div><FamilyTreeCreateDialog projectId={projectId}/></div>
    <div className={styles.treeGrid}>
      <Link href={`${path}/all`} className={`${styles.treeCard} ${styles.virtual}`}><div className={styles.meta}><span className={styles.chip}>VIRTUELL</span><span className={styles.chip}>Alle Familienbeziehungen</span></div><div><h2>Gesamter Familiengraph</h2><p>Projektweite Sicht auf Eltern, Kinder, Geschwister, Ehepartner, Ex-Partner und weitere Familienbeziehungen.</p></div><div className={styles.cardFooter}><span>Automatisch aus Beziehungen</span><strong>Graph öffnen →</strong></div></Link>
      {trees.items.map((tree)=><Link key={tree.tree_id} href={`${path}/${tree.tree_id}`} className={styles.treeCard}><div className={styles.meta}><span className={styles.chip}>{tree.member_count} Personen</span><span className={styles.chip}>{visibilityLabel(tree.visibility_mode)}</span></div><div><h2>{tree.name||`Stammbaum #${tree.tree_id}`}</h2><p>{tree.subtitle||tree.description||"Benannter Familienzweig"}</p></div><div className={styles.cardFooter}><span>Root: {tree.root_name||"nicht festgelegt"}</span><strong>Öffnen →</strong></div></Link>)}
    </div>
    {trees.items.length===0?<div className={styles.empty}>Noch keine benannten Stammbäume. Der Gesamtgraph ist trotzdem jederzeit verfügbar.</div>:null}
    <Pagination pathname={path} searchParams={{personId:search.personId}} page={trees.page} pageSize={trees.pageSize} total={trees.total} totalPages={trees.totalPages}/>
  </AdminShell>;
}
