import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { Pagination } from "@/components/pagination";
import { requireAdminSession } from "@/lib/auth/session";
import { listProjectMapsPaginated } from "@/lib/map-admin-queries";
import { parsePagination } from "@/lib/pagination";
import { getProject } from "@/lib/projects";

type Search=Promise<{q?:string;page?:string;pageSize?:string}>;

export default async function MapsCollectionPage({params,searchParams}:{params:Promise<{projectId:string}>;searchParams:Search}){
  await requireAdminSession();
  const [{projectId:raw},search]=await Promise.all([params,searchParams]);
  const projectId=Number.parseInt(raw,10);
  if(!Number.isSafeInteger(projectId)||projectId<=0)notFound();
  const pagination=parsePagination(search);
  const [project,maps]=await Promise.all([
    getProject(projectId),
    listProjectMapsPaginated(projectId,{query:search.q},pagination),
  ]);
  if(!project)notFound();
  const path=`/admin/projects/${projectId}/map/maps`;
  const hasFilters=Boolean(search.q);

  return <AdminShell projectId={projectId} projectName={project.name} section="map" eyebrow={`${project.name} / Map`} title="Maps">
    <div className="page-heading compact-heading">
      <div>
        <div className="breadcrumb"><Link href={`/admin/projects/${projectId}`}>{project.name}</Link><span>/</span><Link href={`/admin/projects/${projectId}/map`}>Map</Link><span>/</span><strong>Maps</strong></div>
        <h1>Karten</h1>
        <p>Serverseitig paginierte Übersicht aller Tile- und Image-Maps des Projekts.</p>
      </div>
      <div className="row wrap-row"><Link className="button ghost" href={`/admin/projects/${projectId}/map`}>Map-Workspace</Link><Link className="button primary" href={`/admin/projects/${projectId}/settings`}>Maps verwalten</Link></div>
    </div>

    <section className="panel-card">
      <form className="filter-bar" method="get">
        <label className="search-box"><span aria-hidden="true">⌕</span><input name="q" defaultValue={search.q??""} placeholder="Map-Name oder Typ suchen …"/></label>
        <button>Filtern</button>
        {hasFilters?<Link className="button ghost" href={path}>Zurücksetzen</Link>:null}
      </form>
      <div className="table-meta"><span><strong>{maps.total}</strong> Maps</span><span>Tile + Image · stabil nach Primary, Name und ID sortiert</span></div>
      {maps.items.length===0?<div className="empty-state large"><strong>Keine Maps gefunden</strong><span>{hasFilters?"Filter ändern oder zurücksetzen.":"Lege in den Projekteinstellungen die erste Map an."}</span></div>:<div className="entity-card-grid">{maps.items.map((map)=><article className="panel-card nested-card" key={map.map_id}>
        <div className="row wrap-row"><strong>{map.name}</strong>{map.is_primary?<span className="visibility-pill all_players">Primary</span>:null}<span className="soft-label">{map.map_type}</span></div>
        <small>Map #{map.map_id} · Zoom {map.min_zoom}–{map.max_zoom}</small>
        <small><strong>{map.marker_count}</strong> Marker</small>
        {map.map_type==="tile"?<small>{map.tile_url??"Keine Tile URL"}{map.center_lat!=null&&map.center_lng!=null?` · Center ${map.center_lat}, ${map.center_lng}`:""}</small>:<small>{map.image_path??"Kein Image Path"}</small>}
        <div className="row wrap-row"><Link className="button primary" href={`/admin/projects/${projectId}/map?mapId=${map.map_id}`}>Öffnen</Link><Link className="button ghost" href={`/admin/projects/${projectId}/map/markers?mapId=${map.map_id}`}>Marker verwalten</Link></div>
      </article>)}</div>}
      <Pagination pathname={path} searchParams={{q:search.q}} page={maps.page} pageSize={maps.pageSize} total={maps.total} totalPages={maps.totalPages}/>
    </section>
  </AdminShell>;
}
