import Link from "next/link";
import type { ReactNode } from "react";
import { logoutPlayer } from "@/app/player/actions";
import styles from "./player-shell.module.css";

export function PlayerShell({ children, projectName, playerName, immersive = false }: { children: ReactNode; projectName: string; playerName: string; immersive?: boolean }) {
  return (
    <div className={`player-shell${immersive ? ` ${styles.immersive}` : ""}`}>
      <header className="player-topbar">
        <Link href="/player/home" className="admin-brand"><span className="brand-mark">WR</span><span><strong>{projectName}</strong><small>WorldReborn</small></span></Link>
        <nav aria-label="Spieler Navigation" className="player-nav">
          <Link href="/player/home">Home</Link><Link href="/player/map">Map</Link><Link href="/player/timeline">Timeline</Link><Link href="/player/npcs">NPCs</Link><Link href="/player/gods">Gods</Link><Link href="/player/locations">Locations</Link><Link href="/player/groups">Groups</Link><Link href="/player/my-character">My Character</Link>
        </nav>
        <div className="row"><span className="muted">{playerName}</span><form action={logoutPlayer}><button className="button ghost" type="submit">Abmelden</button></form></div>
      </header>
      <main className="player-content">{children}</main>
    </div>
  );
}
