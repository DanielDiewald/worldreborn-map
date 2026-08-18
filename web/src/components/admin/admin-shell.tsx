import Link from "next/link";
import type { ReactNode } from "react";
import { listProjects } from "@/lib/projects";
import { logoutAdmin } from "@/app/admin/actions";
import { ProjectSwitcher } from "./project-switcher";
import styles from "./admin-shell.module.css";

type Section = "dashboard" | "npcs" | "gods" | "characters" | "groups" | "locations" | "relationships" | "family-trees" | "timeline" | "media" | "calendar" | "players" | "audit" | "projects" | "map" | "settings";
type Props = {children:ReactNode;projectId?:number;projectName?:string;section?:Section;eyebrow?:string;title?:string};
type IconName="home"|"map"|"timeline"|"person"|"god"|"character"|"group"|"location"|"link"|"tree"|"graph"|"media"|"players"|"shield"|"settings"|"world";

function Icon({name}:{name:IconName}){
  const paths:Record<IconName,ReactNode>={
    home:<><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-6h5v6"/></>,
    map:<><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z"/><path d="M9 3v15M15 6v15"/></>,
    timeline:<><path d="M5 4v16"/><path d="M5 7h6M5 12h10M5 17h7"/><circle cx="5" cy="7" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="5" cy="17" r="1"/></>,
    person:<><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></>,
    god:<path d="M12 3 9.5 8H4l4.3 3.5L6.5 17 12 13.7 17.5 17l-1.8-5.5L20 8h-5.5Z"/>,
    character:<><circle cx="12" cy="7" r="3.5"/><path d="M6 21v-3a6 6 0 0 1 12 0v3"/><path d="M9 12.5 12 15l3-2.5"/></>,
    group:<><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20a6 6 0 0 1 12 0M14 15a5 5 0 0 1 7 4.5"/></>,
    location:<><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    link:<><path d="m10 13 4-4"/><path d="M7.5 15.5 5 18a3.5 3.5 0 0 1-5-5l3-3a3.5 3.5 0 0 1 5 0" transform="translate(2)"/><path d="m16.5 8.5 2.5-2.5a3.5 3.5 0 0 1 5 5l-3 3a3.5 3.5 0 0 1-5 0" transform="translate(-2)"/></>,
    tree:<><circle cx="12" cy="4" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/><path d="M12 6v6M6 17v-3h12v3"/></>,
    graph:<><circle cx="5" cy="7" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="16" cy="19" r="2"/><circle cx="6" cy="18" r="2"/><path d="m7 7 10-2M18 7l-2 10M14 19H8M7 16l-1-7"/></>,
    media:<><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m4 17 5-5 4 4 2-2 5 5"/></>,
    players:<><circle cx="8" cy="9" r="3"/><circle cx="17" cy="8" r="2.5"/><path d="M2 21a6 6 0 0 1 12 0M13 15a5 5 0 0 1 9 3"/></>,
    shield:<><path d="M12 3 20 6v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6Z"/><path d="m9 12 2 2 4-5"/></>,
    settings:<><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a8 8 0 0 0-1.7-1L14.5 3h-5L9 6a8 8 0 0 0-1.7 1L5 6 3 9.5 5 11a7 7 0 0 0 0 2l-2 1.5L5 18l2.3-1a8 8 0 0 0 1.7 1l.5 3h5l.5-3a8 8 0 0 0 1.7-1l2.3 1 2-3.5-2-1.5a7 7 0 0 0 .1-1Z"/></>,
    world:<><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></>,
  };
  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function NavItem({href,icon,children,active,disabled}:{href?:string;icon:IconName;children:ReactNode;active?:boolean;disabled?:boolean}){
  const className=`admin-nav-item${active?" active":""}${disabled?" disabled":""}`;
  if(!href||disabled)return <span className={className}><Icon name={icon}/><span>{children}</span>{disabled?<span className="soon-dot" title="Noch nicht umgesetzt"/>:null}</span>;
  return <Link className={className} href={href}><Icon name={icon}/><span>{children}</span></Link>;
}

function ProjectNavigation({projectId,section,compact=false}:{projectId?:number;section:Section;compact?:boolean}){
  const base=projectId?`/admin/projects/${projectId}`:"/admin";
  return <nav className={`admin-nav${compact?" mobile-admin-nav":""}`} aria-label={compact?"Mobile Admin Navigation":"Admin Navigation"}>
    <div className="nav-section"><span className="nav-section-title">Übersicht</span><NavItem href={projectId?base:"/admin"} icon="home" active={section==="dashboard"||section==="projects"}>{projectId?"Dashboard":"Projekte"}</NavItem><NavItem href={projectId?`${base}/map`:undefined} icon="map" active={section==="map"} disabled={!projectId}>Map</NavItem><NavItem href={projectId?`${base}/timeline`:undefined} icon="timeline" active={section==="timeline"} disabled={!projectId}>Timeline</NavItem></div>
    <div className="nav-section"><span className="nav-section-title">World</span><NavItem href={projectId?`${base}/npcs`:undefined} icon="person" active={section==="npcs"} disabled={!projectId}>NPCs</NavItem><NavItem href={projectId?`${base}/gods`:undefined} icon="god" active={section==="gods"} disabled={!projectId}>Götter</NavItem><NavItem href={projectId?`${base}/characters`:undefined} icon="character" active={section==="characters"} disabled={!projectId}>Spielercharaktere</NavItem><NavItem href={projectId?`${base}/groups`:undefined} icon="group" active={section==="groups"} disabled={!projectId}>Gruppen</NavItem><NavItem href={projectId?`${base}/locations`:undefined} icon="location" active={section==="locations"} disabled={!projectId}>Orte</NavItem><NavItem href={projectId?`${base}/relationships`:undefined} icon="link" active={section==="relationships"} disabled={!projectId}>Beziehungen</NavItem></div>
    <div className="nav-section"><span className="nav-section-title">Wissen</span><NavItem href={projectId?`${base}/family-trees`:undefined} icon="tree" active={section==="family-trees"} disabled={!projectId}>Stammbäume</NavItem><NavItem href={projectId?`${base}/relationship-graph`:undefined} icon="graph" disabled={!projectId}>Relationship Graph</NavItem><NavItem href={projectId?`${base}/media`:undefined} icon="media" active={section==="media"} disabled={!projectId}>Media</NavItem></div>
    <div className="nav-section"><span className="nav-section-title">Spieler</span><NavItem href={projectId?`${base}/players`:undefined} icon="players" active={section==="players"} disabled={!projectId}>Players</NavItem><NavItem icon="shield" disabled>Permissions</NavItem></div>
    <div className="nav-section"><span className="nav-section-title">System</span><NavItem href="/admin" icon="world">Welten wechseln</NavItem><NavItem href={projectId?`${base}/audit`:undefined} icon="shield" active={section==="audit"} disabled={!projectId}>Audit Log</NavItem><NavItem href={projectId?`${base}/settings`:undefined} icon="settings" active={section==="settings"} disabled={!projectId}>Projekt & Maps</NavItem><NavItem href={projectId?`${base}/settings/calendar`:undefined} icon="settings" active={section==="calendar"} disabled={!projectId}>Weltkalender</NavItem></div>
  </nav>;
}

export async function AdminShell({children,projectId,projectName,section="dashboard",eyebrow,title}:Props){
  const projects=await listProjects();
  return <div className="admin-shell">
    <aside className="admin-sidebar"><Link href="/admin" className="admin-brand"><span className="brand-mark">WR</span><span><strong>WorldReborn</strong><small>World Archive</small></span></Link>{projectId?<div className="sidebar-project"><span className="sidebar-project-label">Aktive Welt</span><strong>{projectName??`Projekt #${projectId}`}</strong><span>Projekt #{projectId}</span></div>:null}<ProjectNavigation projectId={projectId} section={section}/><div className="sidebar-footer"><span className="sidebar-admin-avatar">A</span><div><strong>Administrator</strong><span>Volle Sichtbarkeit</span></div><form action={logoutAdmin}><button type="submit" className="logout-icon" title="Abmelden" aria-label="Abmelden">↗</button></form></div></aside>
    <div className="admin-workspace"><header className="admin-topbar"><details className={styles.mobileMenu}><summary className="button ghost" aria-label="Navigation öffnen">☰</summary><div className={styles.mobilePanel}><div className={styles.mobileHeading}><strong>{projectName??"WorldReborn"}</strong><span>{projectId?`Projekt #${projectId}`:"Administration"}</span></div><ProjectNavigation projectId={projectId} section={section} compact/><form action={logoutAdmin}><button type="submit" className="button ghost">Abmelden</button></form></div></details><div className="topbar-context"><span className="topbar-eyebrow">{eyebrow??(projectName?"WorldReborn / Welt":"WorldReborn")}</span><strong>{title??projectName??"Administration"}</strong></div><div className="topbar-actions"><ProjectSwitcher projects={projects.map((project)=>({id:project.id,name:project.name}))} currentProjectId={projectId}/><span className="admin-mode-pill"><span/> Admin Mode</span></div></header><main className="admin-content">{children}</main></div>
  </div>;
}
