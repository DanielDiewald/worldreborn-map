import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { ConfirmAction } from "@/components/confirm-action";
import { Pagination } from "@/components/pagination";
import { requireAdminSession } from "@/lib/auth/session";
import { listMapMarkerFilterOptions, listMapMarkersPaginated } from "@/lib/map-admin-queries";
import { listProjectMaps } from "@/lib/maps";
import { parsePagination } from "@/lib/pagination";
import { getProject } from "@/lib/projects";
import { deleteMapMarkerAction } from "./actions";

type Search=Promise<{mapId?:string;q?:string;markerType?:string;layer?:string;visibility?:string;page?:string;pageSize?:string}>;

function entityHref(projectId:number,entityType:string|null,entityId:number|null){
  if(!entityType||!entityId)return null;
  if(entityType==="person")return `/admin/projects/${projectId}/npcs/${entityId}`;
  if(entityType==="group")return `/admin/projects/${projectId}/groups/${entityId}`;
  if(entityType==="location")return `/admin/projects/${projectId}/locations/${entityId}`;
  if(entityType==="event")return `/admin/projects/${projectId}/timeline/${entityId}`;
  return null;
}

function coordinates(marker:{coordinate_mode:"latlng"|"xy";lat:number|null;lng:number|null;x:number|null;y:number|null}){
  if(marker.coordinate_mode==="xy")return marker.x!=null&&marker.y!=null?`X ${marker.x.toFixed(1)} · Y ${marker.y.toFixed(1)}`:"–";
  return marker.lat!=null&&marker.lng!=null?`${marker.lat.toFixed(5)}, ${marker.lng.toFixed(5)}`:"–";
}

export default async function MapMarkersPage({params,searchParams}:{params:Promise<{projectId:string}>;searchParams:Search}){
  await requireAdminSession();
  const [{projectId:raw},search]=await Promise.all([params,searchParams]);
  const projectId=Number.parseInt(raw,10);
  if(!Number.isSafeInteger(projectId)||projectId<=0)notFound();
  const [project,maps]=await Promise.all([getProject(projectId),listProjectMaps(projectId)]);
  if(!project)notFound();
  const requested=Number.parseInt(search.mapId??"",10);
  const selected=maps.find((map)=>Number(map.map_id)===requested)??maps.find((map)=>map.is_primary)??maps[0];
  if(!selected){
    return <AdminShell projectId={projectId} projectName={project.name} section="map" eyebrow={`${project.name} / Map`} title="Map Markers"><section className="panel-card empty-state large"><strong>Keine Karte vorhanden</strong><span>Lege zuerst eine Map an.</span><Link className="button primary" href={`/admin/projects/${projectId}/settings`}>Map anlegen</Link></section></AdminShell>;
  }

  const pagination=parsePagination(search);
  const mapId=Number(selected.map_id);
  const [markers,options]=await Promise.all([
    listMapMarkersPaginated(projectId,mapId,{query:search.q,markerType:search.markerType,layer:search.layer,visibilityMode:search.visibility},pagination),
    listMapMarkerFilterOptions(projectId,mapId),
  ]);
  const path=`/admin/projects/${projectId}/map/markers`;
  const hasFilters=Boolean(search.q||search.markerType||search.layer||search.visibility);
  const common={mapId:String(mapId),q:search.q,markerType:search.markerType,layer:search.layer,visibility:search.visibility};

  return <AdminShell projectId={projectId} projectName={project.name} section="map" eyebrow={`${project.name} / Map`} title="Map Markers">
    <div className="page-heading compact-heading">
      <div>
        <div className="breadcrumb"><Link href={`/admin/projects/${projectId}`}>{project.name}</Link><span>/</span><Link href={`/admin/projects/${projectId}/map?mapId=${mapId}`}>{selected.name}</Link><span>/</span><strong>Marker</strong></div>
        <h1>Map Markers</h1>
        <p>Serverseitig paginierte Verwaltung aller Marker von „{selected.name}“.</p>
      </div>
      <div className="row wrap-row"><Link className="button primary" href={`/admin/projects/${projectId}/map?mapId=${mapId}`}>Map-Workspace</Link><Link className="button ghost" href={`/admin/projects/${projectId}/map/maps`}>Alle Maps</Link></div>
    </div>

    <section className="panel-card">
      {maps.length>1?<form className="filter-bar" method="get"><label>Map<select name="mapId" defaultValue={String(mapId)}>{maps.map((map)=><option key={map.map_id} value={map.map_id}>{map.name}{map.is_primary?" · Primary":""}</option>)}</select></label><button>Map öffnen</button></form>:null}
      <form className="filter-bar" method="get">
        <input type="hidden" name="mapId" value={mapId}/>
        <label className="search-box"><span aria-hidden="true">⌕</span><input name="q" defaultValue={search.q??""} placeholder="Name, Beschreibung, Layer oder Lore suchen …"/></label>
        <select name="markerType" defaultValue={search.markerType??""} aria-label="Marker-Typ"><option value="">Alle Typen</option>{options.markerTypes.map((value)=><option key={value} value={value}>{value}</option>)}</select>
        <select name="layer" defaultValue={search.layer??""} aria-label="Layer"><option value="">Alle Layer</option>{options.layers.map((value)=><option key={value} value={value}>{value}</option>)}</select>
        <select name="visibility" defaultValue={search.visibility??""} aria-label="Sichtbarkeit"><option value="">Alle Sichtbarkeiten</option><option value="admin_only">Nur Admin</option><option value="all_players">Alle Spieler</option><option value="selected_players">Ausgewählte Spieler</option></select>
        <button>Filtern</button>
        {hasFilters?<Link className="button ghost" href={`${path}?mapId=${mapId}`}>Zurücksetzen</Link>:null}
      </form>

      <div className="table-meta"><span><strong>{markers.total}</strong> Marker</span><span>{selected.map_type==="image"?"Image Map · X/Y":"Tile Map · Lat/Lng"}</span></div>
      {markers.items.length===0?<div className="empty-state large"><strong>Keine Marker gefunden</strong><span>{hasFilters?"Filter ändern oder zurücksetzen.":"Lege im Map-Workspace den ersten Marker an."}</span></div>:<div className="table-wrap"><table><thead><tr><th>Marker</th><th>Typ / Layer</th><th>Lore</th><th>Koordinate</th><th>Sichtbarkeit</th><th>Aktionen</th></tr></thead><tbody>{markers.items.map((marker)=>{
        const href=entityHref(projectId,marker.entity_type,marker.entity_id);
        return <tr key={marker.marker_id}>
          <td><strong>{marker.label}</strong>{marker.short_description?<small className="muted">{marker.short_description}</small>:null}<small className="muted">#{marker.marker_id}</small></td>
          <td><span className="soft-label">{marker.marker_type}</span><small>{marker.layer} · z {marker.z_index}</small></td>
          <td>{marker.entity_label?<>{href?<Link href={href}><strong>{marker.entity_label}</strong></Link>:<strong>{marker.entity_label}</strong>}<small>{marker.entity_type} #{marker.entity_id}</small></>:<span className="muted">Nicht verknüpft</span>}</td>
          <td>{coordinates(marker)}</td>
          <td><span className={`visibility-pill ${marker.visibility_mode}`}>{marker.visibility_mode}</span></td>
          <td><div className="row wrap-row"><Link className="button ghost" href={`/admin/projects/${projectId}/map?mapId=${mapId}`}>Map öffnen</Link><ConfirmAction action={deleteMapMarkerAction.bind(null,projectId,mapId,Number(marker.marker_id))} title={`Marker „${marker.label}“ löschen?`} description="Der Marker wird von der Karte entfernt. Die verknüpfte Lore-Entität bleibt unverändert." triggerLabel="Löschen…" confirmLabel="Marker löschen" triggerClassName="button danger" confirmClassName="danger"/></div></td>
        </tr>;
      })}</tbody></table></div>}
      <Pagination pathname={path} searchParams={common} page={markers.page} pageSize={markers.pageSize} total={markers.total} totalPages={markers.totalPages}/>
    </section>
  </AdminShell>;
}
