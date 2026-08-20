import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { EntityImageFrame } from "@/components/entity-image-frame";
import { ProfileImageEditor } from "@/components/profile-image-editor";
import { SubmitButton } from "@/components/submit-button";
import { requireAdminSession } from "@/lib/auth/session";
import { getRace } from "@/lib/entities/races";
import { getEntityImageProfile } from "@/lib/entity-image-profiles";
import { getProject } from "@/lib/projects";
import { updateRaceImageAction } from "../../actions";

export default async function RaceImagePage({params}:{params:Promise<{projectId:string;raceId:string}>}){
  await requireAdminSession();
  const raw=await params;
  const projectId=Number.parseInt(raw.projectId,10),raceId=Number.parseInt(raw.raceId,10);
  if(!Number.isSafeInteger(projectId)||!Number.isSafeInteger(raceId)||projectId<=0||raceId<=0)notFound();
  const [project,race]=await Promise.all([getProject(projectId),getRace(projectId,raceId)]);
  if(!project||!race)notFound();
  const imageProfile=await getEntityImageProfile(projectId,"race",raceId,race.image);

  return <AdminShell projectId={projectId} projectName={project.name} section="races" eyebrow={`${project.name} / Spezies`} title={`${race.name} · Bild`}>
    <div className="breadcrumb"><Link href={`/admin/projects/${projectId}/races`}>Spezies</Link><span>/</span><Link href={`/admin/projects/${projectId}/races/${raceId}`}>{race.name}</Link><span>/</span><strong>Bild & Zuschnitt</strong></div>
    <div className="page-heading compact-heading"><div><span className="page-kicker">NICHT-DESTRUKTIVES PROFILBILD</span><h1>Bild & 1:1-Zuschnitt</h1><p>Das Originalbild bleibt vollständig erhalten. Der quadratische Zuschnitt wird separat am Speziesprofil gespeichert und kann jederzeit verschoben, gezoomt oder entfernt werden.</p></div><Link className="button" href={`/admin/projects/${projectId}/races/${raceId}`}>← Zurück zum Codex</Link></div>

    <div className="npc-detail-grid">
      <form action={updateRaceImageAction.bind(null,projectId,raceId)} className="panel-card edit-section stack">
        <div className="panel-heading"><div><span className="panel-kicker">BILDQUELLE & PROFILCROP</span><h2>{race.name}</h2></div><span className="record-id">race_id #{raceId}</span></div>
        <ProfileImageEditor current={race.image} currentCrop={imageProfile?.crop} label="Speziesbild"/>
        <div className="sticky-savebar"><div><strong>Bildprofil speichern</strong><span>Original und 1:1-Zuschnitt bleiben getrennt.</span></div><SubmitButton className="primary" pendingLabel="Bildprofil wird gespeichert …">Bildprofil speichern</SubmitButton></div>
      </form>
      <aside className="stack detail-side">
        <section className="panel-card profile-summary"><span className="panel-kicker">AKTUELLE PROFILANSICHT</span><EntityImageFrame src={race.image} crop={imageProfile?.crop} fallback={race.name.slice(0,1).toUpperCase()} alt={`${race.name} – Speziesbild`} style={{width:"100%",marginTop:10}}/><p className="section-help">{imageProfile?"Ein eigener 1:1-Zuschnitt ist aktiv.":"Kein Zuschnitt gespeichert: WorldReborn zeigt das vollständige Original im quadratischen Fallback-Rahmen."}</p></section>
      </aside>
    </div>
  </AdminShell>;
}
