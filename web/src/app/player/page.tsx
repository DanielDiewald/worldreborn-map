import { redirect } from "next/navigation";
import { PlayerLoginForm } from "@/components/player-login-form";
import { getPlayerSession } from "@/lib/auth/player-session";

export default async function PlayerLoginPage() {
  if (await getPlayerSession()) redirect("/player/home");

  return (
    <main className="auth-page">
      <section className="login-card">
        <div className="login-brand-mark">WR</div>
        <span className="eyebrow">WorldReborn</span>
        <h1>Betritt deine Welt</h1>
        <p>Gib den Spielercode ein, den du von deiner Spielleitung erhalten hast.</p>
        <PlayerLoginForm />
        <small>Dein Code wird nur zur Anmeldung verwendet und nicht im Browser gespeichert.</small>
      </section>
    </main>
  );
}
