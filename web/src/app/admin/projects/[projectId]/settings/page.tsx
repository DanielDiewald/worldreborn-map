import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { ConfirmAction } from "@/components/confirm-action";
import { SubmitButton } from "@/components/submit-button";
import { requireAdminSession } from "@/lib/auth/session";
import { listProjectMaps } from "@/lib/maps";
import { getProject } from "@/lib/projects";
import {
  createImageMapAction,
  createTileMapAction,
  deleteProjectMapAction,
  setPrimaryMapAction,
  updateProjectMapAction,
  updateProjectSettingsAction,
} from "./actions";

function imageDimensions(map:{bounds:unknown;config:Record<string,unknown>}){
  const configuredWidth=Number(map.config?.width);
  const configuredHeight=Number(map.config?.height);
  if(Number.isFinite(configuredWidth)&&configuredWidth>0&&Number.isFinite(configuredHeight)&&configuredHeight>0){
    return {width:configuredWidth,height:configuredHeight};
  }
  if(Array.isArray(map.bounds)&&map.bounds.length===2&&Array.isArray(map.bounds[1])){
    const height=Number(map.bounds[1][0]);
    const width=Number(map.bounds[1][1]);
    if(Number.isFinite(width)&&width>0&&Number.isFinite(height)&&height>0)return{width,height};
  }
  return {width:1000,height:1000};
}

export default async function ProjectSettingsPage({params}:{params:Promise<{projectId:string}>}){
  await requireAdminSession();
  const projectId=Number.parseInt((await params).projectId,10);
  if(!Number.isSafeInteger(projectId)||projectId<=0)notFound();
  const [project,maps]=await Promise.all([getProject(projectId),listProjectMaps(projectId)]);
  if(!project)notFound();

  return <AdminShell projectId={projectId} projectName={project.name} section="settings" eyebrow={`${project.name} / System`} title="Project Settings">
    <div className="page-heading compact-heading">
      <div>
        <div className="breadcrumb"><Link href={`/admin/projects/${projectId}`}>{project.name}</Link><span>/</span><strong>Settings</strong></div>
        <h1>Projekt & Karten</h1>
        <p>Projektmetadaten, Fantasy-Datum und Primary/Secondary Maps.</p>
      </div>
    </div>

    <div className="npc-detail-grid">
      <div className="stack detail-main">
        <section className="panel-card edit-section">
          <div className="panel-heading"><div><span className="panel-kicker">PROJECT</span><h2>Allgemein</h2></div></div>
          <form action={updateProjectSettingsAction.bind(null,projectId)} className="stack">
            <div className="field-grid two">
              <label>Name<input name="name" required defaultValue={project.name}/></label>
              <label>Status<select name="status" defaultValue={project.status}><option value="active">Active</option><option value="planning">Planning</option><option value="archived">Archived</option></select></label>
              <label>In-World-Datum<input name="inWorldDate" defaultValue={project.in_world_date??""} placeholder="3. Zeitalter, Jahr 81"/></label>
              <label>Logo<input name="logo" defaultValue={project.logo??""}/></label>
              <label>Cover/Bild<input name="image" defaultValue={project.image==="noimage"?"":project.image}/></label>
            </div>
            <label>Beschreibung<textarea name="description" className="large-textarea" defaultValue={project.description}/></label>
            <SubmitButton className="primary" pendingLabel="Projekt wird gespeichert …">Projekt speichern</SubmitButton>
          </form>
        </section>

        <section className="panel-card">
          <div className="panel-heading">
            <div><span className="panel-kicker">MAPS</span><h2>Vorhandene Karten</h2><p>Kartenquellen, Zoomgrenzen und Startansicht verwalten. Marker selbst werden im Map-Workspace bearbeitet.</p></div>
            {maps.length?<Link className="button ghost" href={`/admin/projects/${projectId}/map`}>Map-Workspace öffnen</Link>:null}
          </div>
          {maps.length===0?<div className="empty-state"><strong>Keine Karte</strong><span>Lege rechts eine Tile- oder Image-Map an.</span></div>:<div className="stack">{maps.map((map)=>{
            const config=(map.config??{}) as Record<string,unknown>;
            const dimensions=map.map_type==="image"?imageDimensions({bounds:map.bounds,config}):null;
            const noWrap=Boolean(config.no_wrap??config.noWrap??true);
            return <details key={map.map_id} className="panel-card nested-card">
              <summary className="row wrap-row" style={{cursor:"pointer"}}>
                <strong>{map.name}</strong>
                <span className="soft-label">{map.map_type}</span>
                {map.is_primary?<span className="visibility-pill all_players">Primary</span>:null}
                <span className="muted">#{map.map_id} · Zoom {map.min_zoom}–{map.max_zoom}</span>
              </summary>
              <div className="stack" style={{marginTop:12}}>
                <form action={updateProjectMapAction.bind(null,projectId,Number(map.map_id))} className="stack">
                  <input type="hidden" name="mapType" value={map.map_type}/>
                  <label>Name<input name="name" required maxLength={120} defaultValue={map.name}/></label>
                  {map.map_type==="tile"?<>
                    <label>Tile URL<input name="tileUrl" required defaultValue={map.tile_url??""} placeholder="/tiles/{z}/{x}/{y}.png"/></label>
                    <div className="field-grid two">
                      <label>Min Zoom<input name="minZoom" type="number" min={-10} max={30} defaultValue={map.min_zoom}/></label>
                      <label>Max Zoom<input name="maxZoom" type="number" min={-10} max={30} defaultValue={map.max_zoom}/></label>
                      <label>Center Latitude<input name="centerLat" type="number" step="any" defaultValue={map.center_lat??""}/></label>
                      <label>Center Longitude<input name="centerLng" type="number" step="any" defaultValue={map.center_lng??""}/></label>
                    </div>
                    <label><input type="checkbox" name="noWrap" defaultChecked={noWrap}/> No wrap</label>
                  </>:<>
                    <label>Storage/Image Path<input name="imagePath" required defaultValue={map.image_path??""}/></label>
                    <div className="field-grid two">
                      <label>Breite<input name="width" type="number" min="1" step="any" required defaultValue={dimensions?.width}/></label>
                      <label>Höhe<input name="height" type="number" min="1" step="any" required defaultValue={dimensions?.height}/></label>
                      <label>Min Zoom<input name="minZoom" type="number" min={-10} max={30} defaultValue={map.min_zoom}/></label>
                      <label>Max Zoom<input name="maxZoom" type="number" min={-10} max={30} defaultValue={map.max_zoom}/></label>
                    </div>
                  </>}
                  <div className="row wrap-row">
                    <SubmitButton className="primary" pendingLabel="Map wird gespeichert …">Map speichern</SubmitButton>
                    <Link className="button ghost" href={`/admin/projects/${projectId}/map?mapId=${map.map_id}`}>Öffnen</Link>
                  </div>
                </form>

                <div className="row wrap-row">
                  {!map.is_primary?<form action={setPrimaryMapAction.bind(null,projectId)}><input type="hidden" name="mapId" value={map.map_id}/><SubmitButton className="button ghost" pendingLabel="Wird Primary …">Als Primary setzen</SubmitButton></form>:<span className="muted">Primary Map: zuerst eine andere Map als Primary setzen, bevor diese gelöscht werden kann.</span>}
                  {!map.is_primary?<ConfirmAction
                    action={deleteProjectMapAction.bind(null,projectId,Number(map.map_id))}
                    title="Map löschen?"
                    description={`„${map.name}“ wird gelöscht. Das ist nur möglich, wenn keine Marker mehr auf dieser Map liegen.`}
                    triggerLabel="Map löschen"
                    confirmLabel="Map endgültig löschen"
                    pendingLabel="Map wird gelöscht …"
                    triggerClassName="button danger"
                    confirmClassName="danger"
                  />:null}
                </div>
              </div>
            </details>;
          })}</div>}
        </section>
      </div>

      <aside className="stack detail-side">
        <section className="panel-card">
          <span className="panel-kicker">TILE MAP</span>
          <h2>Tile Map hinzufügen</h2>
          <form action={createTileMapAction.bind(null,projectId)} className="stack">
            <label>Name<input name="name" required/></label>
            <label>Tile URL<input name="tileUrl" placeholder="/tiles/{z}/{x}/{y}.png" required/></label>
            <div className="field-grid two">
              <label>Min Zoom<input name="minZoom" type="number" min={-10} max={30} defaultValue="0"/></label>
              <label>Max Zoom<input name="maxZoom" type="number" min={-10} max={30} defaultValue="6"/></label>
              <label>Center Latitude<input name="centerLat" type="number" step="any" placeholder="0"/></label>
              <label>Center Longitude<input name="centerLng" type="number" step="any" placeholder="0"/></label>
            </div>
            <label><input type="checkbox" name="noWrap" defaultChecked/> No wrap</label>
            <label><input type="checkbox" name="isPrimary"/> Als Primary</label>
            <SubmitButton className="primary" pendingLabel="Tile Map wird angelegt …">Tile Map anlegen</SubmitButton>
          </form>
        </section>

        <section className="panel-card">
          <span className="panel-kicker">IMAGE MAP</span>
          <h2>Image Map registrieren</h2>
          <p className="muted">Für bereits sicher gespeicherte Kartenbilder; Uploads werden im Media-Bereich verwaltet.</p>
          <form action={createImageMapAction.bind(null,projectId)} className="stack">
            <label>Name<input name="name" required/></label>
            <label>Storage/Image Path<input name="imagePath" required/></label>
            <div className="field-grid two">
              <label>Breite<input name="width" type="number" min="1" step="any" required/></label>
              <label>Höhe<input name="height" type="number" min="1" step="any" required/></label>
              <label>Min Zoom<input name="minZoom" type="number" min={-10} max={30} defaultValue="-2"/></label>
              <label>Max Zoom<input name="maxZoom" type="number" min={-10} max={30} defaultValue="4"/></label>
            </div>
            <label><input type="checkbox" name="isPrimary"/> Als Primary</label>
            <SubmitButton className="primary" pendingLabel="Image Map wird angelegt …">Image Map anlegen</SubmitButton>
          </form>
        </section>
      </aside>
    </div>
  </AdminShell>;
}
