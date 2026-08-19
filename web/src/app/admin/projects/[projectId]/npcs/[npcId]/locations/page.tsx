import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { EntityPicker } from "@/components/entity-picker";
import { SubmitButton } from "@/components/submit-button";
import { requireAdminSession } from "@/lib/auth/session";
import { getNpc } from "@/lib/entities/npcs";
import { PERSON_LOCATION_ROLES,listPersonLocations } from "@/lib/person-locations";
import { getProject } from "@/lib/projects";
import { addNpcLocationAction,removeNpcLocationAction } from "../../actions";

export default async function NpcLocationsPage({params}:{params:Promise<{projectId:string;npcId:string}>}){
  await requireAdminSession();const raw=await params;const projectId=Number.parseInt(raw.projectId,10),npcId=Number.parseInt(raw.npcId,10);if(!Number.isSafeInteger(projectId)||!Number.isSafeInteger(npcId)||projectId<=0||npcId<=0)notFound();
  const [project,npc,assignments]=await Promise.all([getProject(projectId),getNpc(projectId,npcId),listPersonLocations(projectId,npcId)]);if(!project||!npc)notFound();
  return <AdminShell projectId={projectId} projectName={project.name} section="npcs" eyebrow={`${project.name} / NPCs / Locations`} title={`${npc.name} · Orte`}>
    <div className="breadcrumb"><Link href={`/admin/projects/${projectId}/npcs`}>NPCs</Link><span>/</span><Link href={`/admin/projects/${projectId}/npcs/${npcId}`}>{npc.name}</Link><span>/</span><strong>Orte</strong></div>
    <div className="page-heading compact-heading"><div><h1>Räumliche Verortung</h1><p>Ein NPC kann gleichzeitig einen aktuellen Ort, Heimat, Geburtsort, Arbeitsplatz, Sitz oder temporären Aufenthaltsort besitzen. Der primäre aktuelle Ort bleibt mit dem Character-Datensatz synchron.</p></div><Link className="button ghost" href={`/admin/projects/${projectId}/npcs/${npcId}`}>← NPC</Link></div>
    <div className="two-column-layout"><section className="panel-card"><div className="panel-heading"><div><span className="panel-kicker">ZUGEORDNETE ORTE</span><h2>{assignments.length} Verknüpfungen</h2></div></div>{assignments.length===0?<div className="empty-state"><strong>Noch keine Orte</strong></div>:<div className="stack">{assignments.map(item=><div key={item.assignment_id} className="panel-card" style={{padding:12}}><div className="row wrap-row" style={{justifyContent:"space-between"}}><div><strong>{item.location_name}</strong><div className="muted">{item.role}{item.is_primary?" · primär":""} · {item.location_kind}{item.parent_name?` · in ${item.parent_name}`:""}</div>{item.notes?<small>{item.notes}</small>:null}</div><div className="row wrap-row">{item.map_id&&item.map_feature_id?<Link className="button ghost" href={`/admin/projects/${projectId}/map/studio?mapId=${item.map_id}`}>Auf Karte</Link>:null}{!(item.role==="current"&&item.is_primary)?<form action={removeNpcLocationAction.bind(null,projectId,npcId,Number(item.assignment_id))}><button className="button danger" type="submit">Entfernen</button></form>:null}</div></div></div>)}</div>}</section>
      <aside className="panel-card"><div className="panel-heading"><div><span className="panel-kicker">ORT HINZUFÜGEN</span><h2>Location verknüpfen</h2></div></div><form action={addNpcLocationAction.bind(null,projectId,npcId)} className="stack"><EntityPicker projectId={projectId} name="linkedLocationId" types={["location"]} label="Location" placeholder="Land, Stadt, Gebäude …" required allowClear={false}/><label>Rolle<select name="locationRole" defaultValue="home">{PERSON_LOCATION_ROLES.map(role=><option key={role} value={role}>{role}</option>)}</select></label><label className="row"><input type="checkbox" name="locationPrimary"/> Primäre Location für diese Rolle</label><label>Notiz<textarea name="locationNotes" placeholder="z. B. Zimmer 12, Westflügel"/></label><SubmitButton className="primary" pendingLabel="Speichere …">Ort verknüpfen</SubmitButton></form></aside>
    </div>
  </AdminShell>;
}
