import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdminSession } from "@/lib/auth/session";
import { getFamilyTree } from "@/lib/entities/relationships";
import { getProject } from "@/lib/projects";

export default async function FamilyTreePage({params}:{params:Promise<{projectId:string}>}){
 await requireAdminSession();const projectId=Number.parseInt((await params).projectId,10);if(!Number.isSafeInteger(projectId)||projectId<=0)notFound();const [project,tree]=await Promise.all([getProject(projectId),getFamilyTree(projectId)]);if(!project)notFound();const children=new Map<number,number[]>();const parents=new Set<number>();for(const rel of tree.parentChild){children.set(rel.parent_id,[...(children.get(rel.parent_id)??[]),rel.child_id]);parents.add(rel.child_id);}const roots=tree.people.filter((p)=>!parents.has(p.n_id));const byId=new Map(tree.people.map((p)=>[p.n_id,p]));
 const render=(id:number,seen:Set<number>):React.ReactNode=>{const person=byId.get(id);if(!person||seen.has(id))return null;const next=new Set(seen);next.add(id);return <li key={id}><div className="panel-card nested-card"><span className="soft-label">{person.kind}</span><strong>{person.name}</strong><small>Person #{id}</small></div>{(children.get(id)?.length??0)>0?<ul>{children.get(id)?.map((child)=>render(child,next))}</ul>:null}</li>;};
 return <AdminShell projectId={projectId} projectName={project.name} eyebrow={`${project.name} / Wissen`} title="Family Tree"><div className="page-heading compact-heading"><div><div className="breadcrumb"><Link href={`/admin/projects/${projectId}/relationships`}>Beziehungen</Link><span>/</span><strong>Family Tree</strong></div><h1>Stammbaum</h1><p>NPCs, Götter und Spielercharaktere teilen denselben Personenbaum.</p></div></div><section className="panel-card family-tree"><ul>{roots.map((root)=>render(root.n_id,new Set()))}</ul>{roots.length===0?<div className="empty-state"><strong>Keine Wurzel gefunden</strong><span>Der Baum kann zyklische oder noch unvollständige Parent-Relationen enthalten.</span></div>:null}</section></AdminShell>;
}
