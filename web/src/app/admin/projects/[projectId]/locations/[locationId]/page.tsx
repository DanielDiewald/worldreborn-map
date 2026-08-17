import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdminSession } from "@/lib/auth/session";
import { getLocation, listLocations } from "@/lib/entities/locations";
import { listNpcs } from "@/lib/entities/npcs";
import { getProject } from "@/lib/projects";
import { archiveLocationAction, updateLocationAction } from "../actions";

export default async function LocationDetailPage({ params }: { params: Promise<{ projectId: string; locationId: string }> }) {
  await requireAdminSession();
  const raw=await params; const projectId=Number.parseInt(raw.projectId,10); const locationId=Number.parseInt(raw.locationId,10);
  if(!Number.isSafeInteger(projectId)||!Number.isSafeInteger(locationId)||projectId<=0||locationId<=0) notFound();
  const [project,location,locations,npcs]=await Promise.all([getProject(projectId),getLocation(projectId,locationId),listLocations(projectId),listNpcs(projectId)]);
  if(!project||!location) notFound();
  return <AdminShell projectId={projectId} projectName={project.name} section="locations" title={String(location.name)} eyebrow={`${project.name} / Locations`}>
    <div className="breadcrumb"><Link href={`/admin/projects/${projectId}/locations`}>Locations</Link><span>/</span><strong>{String(location.name)}</strong></div>
    <form action={updateLocationAction.bind(null,projectId,locationId)} className="npc-detail-grid"><div className="stack detail-main"><section className="panel-card edit-section"><div className="panel-heading"><div><span className="panel-kicker">LOCATION #{locationId}</span><h2>Grunddaten</h2></div></div><div className="field-grid two">
      <label>Name<input name="name" defaultValue={String(location.name)} required/></label><label>Typ<input name="locationType" defaultValue={location.location_type ? String(location.location_type) : ""}/></label>
      <label>Parent<select name="parentLocId" defaultValue={location.parent_loc_id ? String(location.parent_loc_id) : ""}><option value="">—</option>{locations.filter((l)=>l.loc_id!==locationId).map((l)=><option key={l.loc_id} value={l.loc_id}>{l.name}</option>)}</select></label>
      <label>Besitzer/Herrscher<select name="ownerNpcId" defaultValue={location.owner_n_id ? String(location.owner_n_id) : ""}><option value="">—</option>{npcs.map((npc)=><option key={npc.nId} value={npc.nId}>{npc.name}</option>)}</select></label>
      <label>Population<input name="population" type="number" min="0" defaultValue={location.population ? String(location.population) : ""}/></label><label>Wappen<input name="coatOfArm" defaultValue={location.coat_of_arm ? String(location.coat_of_arm) : ""}/></label>
      <label>Sichtbarkeit<select name="visibilityMode" defaultValue={String(location.visibility_mode)}><option value="admin_only">Admin only</option><option value="all_players">Alle Spieler</option><option value="selected_players">Ausgewählte</option></select></label>
    </div><label>Beschreibung<textarea name="description" className="large-textarea" defaultValue={location.description ? String(location.description) : ""}/></label></section><div className="sticky-savebar"><div><strong>Änderungen speichern</strong><span>Location-ID bleibt unverändert.</span></div><button className="primary">Speichern</button></div></div></form>
    <section className="danger-zone"><div><h2>Location archivieren</h2><p>Der Datensatz wird nicht hart gelöscht.</p></div><form action={archiveLocationAction.bind(null,projectId,locationId)}><button className="danger">Archivieren</button></form></section>
  </AdminShell>;
}
