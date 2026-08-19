"use client";

import { useState } from "react";

export function Rock3MapCreator({
  projectId,
  defaultName,
}: {
  projectId: number;
  defaultName: string;
}) {
  const [name, setName] = useState(defaultName);
  const [archive, setArchive] = useState<File | null>(null);
  const [isPrimary, setIsPrimary] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function createMap() {
    if (!name.trim()) {
      setError("Bitte gib der Karte einen Namen.");
      return;
    }
    if (!archive) {
      setError("Bitte wähle deine Rock-3-ZIP aus.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("name", name.trim());
      form.append("archive", archive, archive.name);
      form.append("isPrimary", isPrimary ? "true" : "false");

      const response = await fetch(`/api/admin/projects/${projectId}/maps/rock3-create`, {
        method: "POST",
        body: form,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Weltkarte konnte nicht erstellt werden.");
      if (typeof body.editorUrl !== "string") throw new Error("Editor-URL fehlt in der Serverantwort.");

      window.location.assign(body.editorUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Weltkarte konnte nicht erstellt werden.");
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="field-grid two">
        <label>
          Name der Weltkarte
          <input
            value={name}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            placeholder="z. B. Aetheris · Weltkarte"
            disabled={busy}
          />
        </label>
        <label>
          Rock-3-Export
          <input
            type="file"
            accept=".zip,application/zip,application/x-zip-compressed"
            onChange={(event) => setArchive(event.target.files?.[0] ?? null)}
            disabled={busy}
          />
        </label>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
          gap: 8,
        }}
      >
        <div className="soft-label">1 · ZIP auswählen</div>
        <div className="soft-label">2 · WorldReborn erkennt alle Layer</div>
        <div className="soft-label">3 · Editor öffnet automatisch</div>
      </div>

      {archive ? (
        <div className="notice">
          <strong>{archive.name}</strong>
          <div className="muted">{Math.max(1, Math.round(archive.size / 1024 / 1024))} MB · bereit zum Import</div>
        </div>
      ) : (
        <div className="muted">Wähle einfach die ZIP, die du aus dem kompletten Rock-3-Exportordner erstellt hast.</div>
      )}

      <label className="row">
        <input
          type="checkbox"
          checked={isPrimary}
          onChange={(event) => setIsPrimary(event.target.checked)}
          disabled={busy}
        />
        Als Hauptkarte des Projekts verwenden
      </label>

      <button type="button" className="button primary" onClick={createMap} disabled={busy || !archive || !name.trim()}>
        {busy ? "Weltkarte wird erstellt …" : "Weltkarte aus ZIP erstellen"}
      </button>

      <p className="muted" style={{ margin: 0 }}>
        Satellite Color wird automatisch zur Basiskarte. Biome, Niederschlag, Temperatur, Höhenkarten und Land Mask werden als umschaltbare Layer angelegt. Länder, Städte, Straßen und Flüsse bekommen eigene Vektor-Layer.
      </p>

      {error ? <div className="error-message" aria-live="assertive">{error}</div> : null}
    </div>
  );
}
