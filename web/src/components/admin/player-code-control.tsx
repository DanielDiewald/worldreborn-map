"use client";

import { useActionState } from "react";
import { issuePlayerCodeAction } from "@/app/admin/projects/[projectId]/players/actions";

export function PlayerCodeControl({ projectId, playerId }: { projectId: number; playerId: number }) {
  const action = issuePlayerCodeAction.bind(null, projectId, playerId);
  const [state, formAction, pending] = useActionState(action, { code: null, error: null });

  return (
    <div className="stack compact-stack">
      <form action={formAction}>
        <button type="submit" className="button ghost" disabled={pending}>
          {pending ? "Erzeuge …" : "Neuen Code generieren"}
        </button>
      </form>
      {state.code ? (
        <div className="code-reveal" role="status">
          <strong>{state.code}</strong>
          <small>Nur jetzt sichtbar. Bitte sicher an den Spieler weitergeben.</small>
        </div>
      ) : null}
      {state.error ? <span className="form-error">{state.error}</span> : null}
    </div>
  );
}
