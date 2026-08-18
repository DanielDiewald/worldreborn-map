"use client";

import { useActionState } from "react";
import { loginPlayer } from "@/app/player/actions";

export function PlayerLoginForm() {
  const [error, action, pending] = useActionState(loginPlayer, null);

  return (
    <form action={action} className="stack">
      <label>
        Spielercode
        <input
          name="code"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          placeholder="WR-7FK2-9MLQ-P4"
          maxLength={64}
          required
        />
      </label>
      {error ? <p role="alert" className="form-error">{error}</p> : null}
      <button className="primary" type="submit" disabled={pending}>
        {pending ? "Welt wird geöffnet …" : "Welt betreten"}
      </button>
    </form>
  );
}
