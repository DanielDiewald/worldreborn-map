import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { ConfirmAction } from "@/components/confirm-action";
import { EntityPicker } from "@/components/entity-picker";
import { ImageSourceInput } from "@/components/image-source-input";
import { SubmitButton } from "@/components/submit-button";
import { requireAdminSession } from "@/lib/auth/session";
import { getLocation } from "@/lib/entities/locations";
import { getProject } from "@/lib/projects";
import { archiveLocationAction, updateLocationAction } from "../actions";

export default async function LocationDetailPage({params}:{params:Promise<{projectId:string;locationId:string}>}){
  await requireAdminSession();const raw=await params;const projectId=Number.parseInt(raw.projectId,10);const locationId=Number.parseInt(raw.locationId,10);if(!Number.isSafeInteger(projectId)||!Number.isSafeInteger(locationId)||projectId<=0||locationId<=0)notFound();
  const [project,location]=await Promise.all([getProject(projectId),getLocation(projectId,locationId)]);if(!project||!location)notFound();
  return <AdminShell projectId={projectId} projectName={project.name} section="locations" title={String(location.name)} eyebrow={`${project.name} / Locations`}>
    <div className="breadcrumb"><Link href={`/admin/projects/${projectId}/locations`}>Locations</Link><span>/</span><strong>{String(location.name)}</strong></div>
    <section className="entity-hero"><div className="entity-avatar hero-avatar">{location.coat_of_arm?<img src={String(location.coat_of_arm)} alt="" loading="lazy"/>:String(location.name).slice(0,1).toUpperCase()}</div><div className="entity-hero-main"><span className="page-kicker">LOCATION #{locationId}</span><h1>{String(location.name)}</h1><p>{location.location_type?String(location.location_type):"Location"}</p></div></section>
    <form action={updateLocationAction.bind(null,projectId,locationId)} className="npc-detail-grid"><div className="stack detail-main"><section className="panel-card edit-section"><div className="panel-heading"><div><span className="panel-kicker">LOCATION #{locationId}</span><h2>Grunddaten</h2></div></div><div className="field-grid two">
      <label>Name<input name="name" defaultValue={String(location.name)} required/></label><label>Typ<input name="locationType" defaultValue={location.location_type?String(location.location_type):""}/></label>
      <EntityPicker projectId={projectId} name="parentLocId" types={["location"]} label="Parent" placeholder="Parent Location suchen …" initialValue={location.parent_loc_id?String(location.parent_loc_id):""} initialLabel={location.parent_name??""} initialKind="Location"/>
      <EntityPicker projectId={projectId} name="ownerNpcId" types={["person"]} label="Besitzer / Herrscher" placeholder="Person suchen …" initialValue={location.owner_n_id?String(location.owner_n_id):""} initialLabel={location.owner_name??""}/>
      <label>Population<input name="population" type="number" min="0" defaultValue={location.population?String(location.population):""}/></label>
      <label>Sichtbarkeit<select name="visibilityMode" defaultValue={String(location.visibility_mode)}><option value="admin_only">Admin only</option><option value="all_players">Alle Spieler</option><option value="selected_players">Ausgewählte</option></select></label>
    </div><ImageSourceInput current={location.coat_of_arm?String(location.coat_of_arm):null} pathName="coatOfArm" fileName="coatOfArmFile" label="Wappen / Bild"/><label>Beschreibung<textarea name="description" className="large-textarea" defaultValue={location.description?String(location.description):""}/></label></section><div className="sticky-savebar"><div><strong>Änderungen speichern</strong><span>Location-ID bleibt unverändert.</span></div><SubmitButton className="primary" pendingLabel="Speichere Location …">Speichern</SubmitButton></div></div></form>
    <section className="danger-zone"><div><h2>Location archivieren</h2><p>Der Datensatz wird nicht hart gelöscht.</p></div><ConfirmAction action={archiveLocationAction.bind(null,projectId,locationId)} title={`${String(location.name)} archivieren?`} description="Die Location verschwindet aus aktiven Listen. Der Datensatz wird nicht hart gelöscht." triggerLabel="Archivieren…" confirmLabel="Location archivieren" triggerClassName="button danger"/></section>
  </AdminShell>;
}
