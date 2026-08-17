import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdminSession } from "@/lib/auth/session";
import { listMedia } from "@/lib/media";
import { getProject } from "@/lib/projects";
import { deleteMediaAction, uploadMediaAction } from "./actions";

export default async function MediaPage({params}:{params:Promise<{projectId:string}>}){
 await requireAdminSession();const projectId=Number.parseInt((await params).projectId,10);if(!Number.isSafeInteger(projectId)||projectId<=0)notFound();const [project,media]=await Promise.all([getProject(projectId),listMedia(projectId)]);if(!project)notFound();
 return <AdminShell projectId={projectId} projectName={project.name} eyebrow={`${project.name} / Wissen`} title="Media">
  <div className="page-heading compact-heading"><div><div className="breadcrumb"><Link href={`/admin/projects/${projectId}`}>{project.name}</Link><span>/</span><strong>Media</strong></div><h1>Medienbibliothek</h1><p>Dateityp und Bilddimensionen werden aus dem tatsächlichen Dateiinhalt geprüft; interne Dateinamen sind zufällig.</p></div><details className="create-dropdown"><summary className="button primary">＋ Bild hochladen</summary><div className="create-popover"><form action={uploadMediaAction.bind(null,projectId)} className="stack"><label>Datei<input type="file" name="file" accept="image/jpeg,image/png,image/webp,image/gif" required/></label><label>Titel<input name="title"/></label><label>Alt-Text<input name="altText"/></label><div className="field-grid two"><label>Entity Type<input name="entityType" placeholder="npc, location …"/></label><label>Entity ID<input name="entityId" type="number" min="1"/></label></div><button className="primary">Sicher hochladen</button></form></div></details></div>
  <section className="panel-card"><div className="table-meta"><span><strong>{media.length}</strong> Medien</span><span>Standardlimit 10 MB</span></div>{media.length===0?<div className="empty-state large"><strong>Noch keine Medien</strong></div>:<div className="entity-card-grid">{media.map((item)=><article className="panel-card nested-card" key={item.media_id}><img src={`/api/media/${item.media_id}`} alt={item.alt_text??""} style={{maxWidth:"100%",maxHeight:240,objectFit:"contain"}}/><strong>{item.title||item.original_filename||`Media #${item.media_id}`}</strong><small>{item.mime_type} · {item.size_bytes?`${Math.ceil(Number(item.size_bytes)/1024)} KB`:"extern"}</small><small>{item.entity_type?`${item.entity_type} #${item.entity_id}`:"Galerie"}</small><form action={deleteMediaAction.bind(null,projectId,Number(item.media_id))}><button className="button ghost">Löschen</button></form></article>)}</div>}</section>
 </AdminShell>;
}
