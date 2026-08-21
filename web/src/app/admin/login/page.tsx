import { FormRequiredLegend } from "@/components/form-ui";
import { SubmitButton } from "@/components/submit-button";
import { loginAdmin } from "./actions";

type Props = { searchParams: Promise<{ error?: string }> };

const errorMessages: Record<string, string> = {
  invalid: "Bitte Benutzername und Passwort ausfüllen.",
  credentials: "Die Admin-Zugangsdaten sind nicht korrekt.",
  rate: "Zu viele Versuche. Bitte nach dem Sperrfenster erneut versuchen.",
};

export default async function AdminLoginPage({ searchParams }: Props) {
  const { error } = await searchParams;

  return (
    <main className="login-wrap">
      <section className="login-card stack">
        <div className="login-brand">
          <span className="brand-mark">WR</span>
          <div><strong>WorldReborn</strong><span>Privates Weltarchiv</span></div>
        </div>
        <div>
          <span className="page-kicker">ADMINISTRATION</span>
          <h1>Willkommen zurück</h1>
          <p>Melde dich an, um deine Welten, NPCs und geheimen Informationen zu verwalten.</p>
        </div>
        {error ? <p className="form-message error" role="alert">{errorMessages[error] ?? "Anmeldung fehlgeschlagen."}</p> : null}
        <form action={loginAdmin} className="stack">
          <FormRequiredLegend/>
          <label>Benutzername<input name="username" autoComplete="username" required autoFocus /></label>
          <label>Passwort<input name="password" type="password" autoComplete="current-password" required /></label>
          <SubmitButton className="primary" pendingLabel="Anmeldung läuft …">Admin-Bereich öffnen</SubmitButton>
        </form>
      </section>
    </main>
  );
}
