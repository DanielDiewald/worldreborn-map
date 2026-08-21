import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { EntityImageFrame } from "@/components/entity-image-frame";
import { Pagination } from "@/components/pagination";
import { requireAdminSession } from "@/lib/auth/session";
import { listGodsPaginated, type GodListFilters } from "@/lib/entities/gods";
import { parsePagination } from "@/lib/pagination";
import { getProject } from "@/lib/projects";
import { GodCreateDialog } from "./god-create-dialog";
import styles from "./gods.module.css";

type Search=Promise<{q?:string;visibility?:string;page?:string;pageSize?:string}>;
function visibilityLabel(mode:string){return mode==="all_players"?"Alle Spieler":mode==="selected_players"?"Ausgewählte Spieler":"Nur Admin";}
function clean(value:string|null|undefined){const text=value?.trim()??"";return text&&!['unknown','no notes yet'].includes(text.toLowerCase())?text:"";}

export default async function GodsPage({params,searchParams}:{params:Promise<{projectId:string}>;searchParams:Search}){
  await requireAdminSession();const [{projectId:raw},search]=await Promise.all([params,searchParams]);const projectId=Number.parseInt(raw,10);if(!Number.isSafeInteger(projectId)||projectId<=0)notFound();const visibility=["admin_only","all_players","selected_players"].includes(search.visibility??"")?search.visibility as GodListFilters["visibility"]:undefined;const pagination=parsePagination(search);const [project,gods]=await Promise.all([getProject(projectId),listGodsPaginated(projectId,{query:search.q,visibility},pagination)]);if(!project)notFound();const path=`/admin/projects/${projectId}/gods`;const hasFilters=Boolean(search.q||search.visibility);
  return <AdminShell projectId={projectId} projectName={project.name} section="gods" eyebrow={`${project.name} / Welt`} title="Götter">
    <div className="page-heading compact-heading"><div><div className="breadcrumb"><Link href={`/admin/projects/${projectId}`}>{project.name}</Link><span>/</span><strong>Götter</strong></div><h1>Pantheon & Gottheiten</h1><p>Götter sind Personen mit eigenem Gottheiten-Subtyp. Das Personengeschlecht verwendet dieselben kanonischen Optionen wie NPCs und Spielercharaktere.</p></div><GodCreateDialog projectId={projectId}/></div>
    <section className={`panel-card ${styles.browser}`}><form className={styles.filter} method="get"><input name="q" defaultValue={search.q??""} placeholder="Gott, Domäne, Titel oder Pantheon suchen …" aria-label="Gottheiten durchsuchen"/><select name="visibility" defaultValue={visibility??""} aria-label="Sichtbarkeit"><option value="">Alle Sichtbarkeiten</option><option value="admin_only">Nur Admin</option><option value="all_players">Alle Spieler</option><option value="selected_players">Ausgewählte Spieler</option></select><button type="submit">Filtern</button>{hasFilters?<Link className="button ghost" href={path}>Zurücksetzen</Link>:null}</form><div className="table-meta"><span><strong>{gods.total}</strong> Gottheiten</span><span>Listenbilder werden als kleine Avatar-Derivate geladen</span></div>{gods.items.length===0?<div className="empty-state large"><strong>Keine Gottheiten gefunden</strong><span>{hasFilters?"Filter ändern oder zurücksetzen.":"Lege die erste Gottheit an."}</span></div>:<div className={styles.grid}>{gods.items.map((god)=><Link key={god.person_id} href={`/admin/projects/${projectId}/gods/${god.person_id}`} className={styles.card}><div className={styles.cover}><EntityImageFrame mode="thumbnail" src={god.image} fallback={god.name.slice(0,1).toUpperCase()} alt={`${god.name} – Darstellung`} style={{width:"100%",height:"100%"}}/><span className={styles.domain}>{clean(god.domain)||"Unbekannte Domäne"}</span></div><div className={styles.body}><div><h2>{god.name}</h2><p>{clean(god.title)||clean(god.person_title)||"Gottheit"}</p></div><div className={styles.meta}><span className={styles.chip}>{clean(god.faction)||"Ohne Pantheon"}</span>{clean(god.species)?<span className={styles.chip}>{god.species}</span>:null}{clean(god.profession)?<span className={styles.chip}>{god.profession}</span>:null}</div>{clean(god.public_description)?<p>{god.public_description}</p>:null}<div className={styles.footer}><span>{visibilityLabel(god.visibility_mode)}</span><strong>Profil öffnen →</strong></div></div></Link>)}</div>}<Pagination pathname={path} searchParams={{q:search.q,visibility:search.visibility}} page={gods.page} pageSize={gods.pageSize} total={gods.total} totalPages={gods.totalPages}/></section>
  </AdminShell>;
}
