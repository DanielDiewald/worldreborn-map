import Link from "next/link";
import type { ReactNode } from "react";
import { logoutPlayer } from "@/app/player/actions";

export function PlayerShell({
  children,
  projectName,
  playerName,
}: {
  children: ReactNode;
  projectName: string;
  playerName: string;
}) {
  return (
    <div className="player-shell">
      <header className="player-topbar">
        <Link href="/player/home" className="admin-brand">
          <span className="brand-mark">WR</span>
          <span><strong>{projectName}</strong><small>WorldReborn</small></span>
        </Link>
        <nav aria-label="Spieler Navigation" className="player-nav">
          <Link href="/player/home">Home</Link>
          <Link href="/player/npcs">NPCs</Link>
        </nav>
        <div className="row">
          <span className="muted">{playerName}</span>
          <form action={logoutPlayer}><button className="button ghost" type="submit">Abmelden</button></form>
        </div>
      </header>
      <main className="player-content">{children}</main>
    </div>
  );
}
