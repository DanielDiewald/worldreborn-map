import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { MapViewer } from "@/components/map-viewer";
import { requireAdminSession } from "@/lib/auth/session";
import { listMapMarkers, listProjectMapPlayers, listProjectMaps } from "@/lib/maps";
import { getProject } from "@/lib/projects";

export default async function AdminMapPage({
  params,
  searchParams,
}:{
  params:Promise<{projectId:string}>;
  searchParams:Promise<{mapId?:string}>;
}){
  await requireAdminSession();
  const [raw,search]=await Promise.all([params,searchParams]);
  const projectId=Number.parseInt(raw.projectId,10);
  if(!Number.isSafeInteger(projectId)||projectId<=0)notFound();

  const [project,maps,players]=await Promise.all([
    getProject(projectId),
    listProjectMaps(projectId),
    listProjectMapPlayers(projectId),
  ]);
  if(!project)notFound();

  const requested=search.mapId?Number.parseInt(search.mapId,10):null;
  const selected=maps.find((map)=>Number(map.map_id)===requested)??maps.find((map)=>map.is_primary)??maps[0];
  if(!selected){
    return <AdminShell projectId={projectId} projectName={project.name} section="map" title="Map">
      <section className="panel-card empty-state large">
        <strong>Keine Karte vorhanden</strong>
        <span>Lege zuerst eine Tile- oder Image-Map in den Projekteinstellungen an.</span>
        <Link className="button primary" href={`/admin/projects/${projectId}/settings`}>Karte anlegen</Link>
      </section>
    </AdminShell>;
  }

  const markers=await listMapMarkers(projectId,Number(selected.map_id));
  const config={
    mapId:Number(selected.map_id),
    mapType:selected.map_type as "tile"|"image",
    tileUrl:selected.tile_url,
    imagePath:selected.image_path,
    minZoom:selected.min_zoom,
    maxZoom:selected.max_zoom,
    centerLat:selected.center_lat,
    centerLng:selected.center_lng,
    bounds:selected.bounds,
    config:selected.config,
  };

  return <AdminShell projectId={projectId} projectName={project.name} section="map" eyebrow={`${project.name} / Map`} title={selected.name}>
    <div className="page-heading compact-heading">
      <div>
        <div className="breadcrumb"><Link href={`/admin/projects/${projectId}`}>{project.name}</Link><span>/</span><strong>Map</strong></div>
        <h1>{selected.name}</h1>
        <p>Marker platzieren, verschieben, mit Lore verknüpfen, in Layer gliedern und gezielt für Spieler freigeben.</p>
      </div>
      <div className="row wrap-row">
        {maps.length>1?<form method="get" className="row">
          <select name="mapId" defaultValue={String(selected.map_id)} aria-label="Map Auswahl">
            {maps.map((map)=><option key={map.map_id} value={map.map_id}>{map.name}{map.is_primary?" · Primary":""}</option>)}
          </select>
          <button className="button ghost">Öffnen</button>
        </form>:null}
        <Link className="button ghost" href={`/admin/projects/${projectId}/settings`}>Maps verwalten</Link>
      </div>
    </div>

    <section className="panel-card">
      <div className="table-meta">
        <span><strong>{markers.length}</strong> Marker</span>
        <span>{players.length} aktive Spieler für selektive Freigaben</span>
        <span>{selected.map_type === "image" ? "Image Map · X/Y" : "Tile Map · Lat/Lng"}</span>
      </div>
      <MapViewer key={config.mapId} mapConfig={config} initialMarkers={markers} admin projectId={projectId} players={players}/>
    </section>

    {maps.length>1?<section className="panel-card">
      <div className="panel-heading"><div><span className="panel-kicker">MAPS</span><h2>Schnell wechseln</h2></div></div>
      <div className="row wrap-row">{maps.map((map)=><Link key={map.map_id} className="button ghost" href={`/admin/projects/${projectId}/map?mapId=${map.map_id}`}>{map.name}{map.is_primary?" · Primary":""}</Link>)}</div>
    </section>:null}
  </AdminShell>;
}
