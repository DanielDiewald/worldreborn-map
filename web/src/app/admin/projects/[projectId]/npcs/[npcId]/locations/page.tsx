import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { EntityPicker } from "@/components/entity-picker";
import { SubmitButton } from "@/components/submit-button";
import { requireAdminSession } from "@/lib/auth/session";
import { getNpc } from "@/lib/entities/npcs";
import { locationKindLabel } from "@/lib/location-presentation";
import { personLocationRoleLabel } from "@/lib/person-location-presentation";
import { PERSON_LOCATION_ROLES,listPersonLocations } from "@/lib/person-locations";
import { getProject } from "@/lib/projects";
import { addNpcLocationAction,removeNpcLocationAction } from "../../actions";

export default async function NpcLocationsPage({params}:{params:Promise<{projectId:string;npcId:string}>}){
  await requireAdminSession();const raw=await params;const projectId=Number.parseInt(raw.projectId,10),npcId=Number.parseInt(raw.npcId,10);if(!Number.isSafeInteger(projectId)||!Number.isSafeInteger(npcId)||projectId<=0||npcId<=0)notFound();
  const [project,npc,assignments]=await Promise.all([getProject(projectId),getNpc(projectId,npcId),listPersonLocations(projectId,npcId)]);if(!project||!npc)notFound();
  const mapped=assignments.filter(item=>item.map_id&&item.map_feature_id);
  return <AdminShell projectId={projectId} projectName={project.name} section="npcs" eyebrow={`${project.name} / NPCs / Orte`} title={`${npc.name} · Orte`}>
    <div className="breadcrumb"><Link href={`/admin/projects/${projectId}/npcs`}>NPCs</Link><span>/</span><Link href={`/admin/projects/${projectId}/npcs/${npcId}`}>{npc.name}</Link><span>/</span><strong>Orte</strong></div>
    <div className="page-heading compact-heading"><div><h1>Wo ist {npc.name} zuhause?</h1><p>Verknüpfe aktuellen Aufenthaltsort, Heimat, Geburtsort, Arbeitsplatz oder Sitz. Die Suche lädt Orte serverseitig und funktioniert auch bei großen Welten.</p></div><div className="row wrap-row">{mapped[0]?<Link className="button primary" href={`/admin/projects/${projectId}/map?mapId=${mapped[0].map_id}&featureId=${mapped[0].map_feature_id}`}>Auf Karte anzeigen</Link>:null}<Link className="button ghost" href={`/admin/projects/${projectId}/npcs/${npcId}`}>← NPC</Link></div></div>
    <div className="two-column-layout"><section className="panel-card"><div className="panel-heading"><div><span className="panel-kicker">RÄUMLICHE VERORTUNG</span><h2>{assignments.length} Orte</h2></div></div>{assignments.length===0?<div className="empty-state"><strong>Noch keine Orte</strong><span>Ordne zuerst einen aktuellen Ort oder eine Heimat zu.</span></div>:<div className="stack">{assignments.map(item=><div key={item.assignment_id} className="panel-card nested-card" style={{padding:12}}><div className="row wrap-row" style={{justifyContent:"space-between"}}><div><span className="soft-label">{personLocationRoleLabel(item.role)}{item.is_primary?" · Primär":""}</span><h3 style={{margin:"5px 0"}}>{item.location_name}</h3><div className="muted">{locationKindLabel(item.location_kind)}{item.parent_name?` · ${item.parent_name} › ${item.location_name}`:""}</div>{item.notes?<small>{item.notes}</small>:null}</div><div className="row wrap-row"><Link className="button ghost" href={`/admin/projects/${projectId}/locations/${item.location_id}`}>Ort öffnen</Link>{item.map_id&&item.map_feature_id?<Link className="button primary" href={`/admin/projects/${projectId}/map?mapId=${item.map_id}&featureId=${item.map_feature_id}`}>Auf Karte</Link>:null}{!(item.role==="current"&&item.is_primary)?<form action={removeNpcLocationAction.bind(null,projectId,npcId,Number(item.assignment_id))}><button className="button danger" type="submit">Verknüpfung entfernen</button></form>:null}</div></div></div>)}</div>}</section>
      <aside className="panel-card"><div className="panel-heading"><div><span className="panel-kicker">ORT HINZUFÜGEN</span><h2>Räumliche Beziehung</h2></div></div><form action={addNpcLocationAction.bind(null,projectId,npcId)} className="stack"><EntityPicker projectId={projectId} name="linkedLocationId" types={["location"]} label="Ort suchen" placeholder="Palast, Stadt, Provinz, Land …" required allowClear={false} hint="Du kannst bis auf Gebäude- oder Bezirksebene suchen."/><label>Beziehung<select name="locationRole" defaultValue="home">{PERSON_LOCATION_ROLES.map(role=><option key={role} value={role}>{personLocationRoleLabel(role)}</option>)}</select></label><label className="row"><input type="checkbox" name="locationPrimary"/> Wichtigster Ort für diese Beziehung</label><label>Notiz<textarea name="locationNotes" placeholder="z. B. Zimmer 12, Westflügel"/></label><SubmitButton className="primary" pendingLabel="Speichere …">Ort verknüpfen</SubmitButton></form></aside>
    </div>
  </AdminShell>;
}
