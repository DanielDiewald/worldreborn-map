"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "worldreborn:land-mask-precision";
const OPTIONS = [
  { value: 1024, label: "Schnell · 1024", hint: "Für grobe Arbeit und schwächere Geräte" },
  { value: 2048, label: "Genau · 2048", hint: "Guter Standard für normale Bearbeitung" },
  { value: 4096, label: "Sehr genau · 4096", hint: "Feinere Buchten, Inseln und Küsten" },
  { value: 8192, label: "Original · bis 8192", hint: "Maximale Rock-3-Küstenpräzision, benötigt mehr RAM" },
] as const;

export function LandMaskPrecisionControl() {
  const [value, setValue] = useState(4096);
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem(STORAGE_KEY));
      if (OPTIONS.some((option) => option.value === saved)) setValue(saved);
    } catch { /* optional browser preference */ }
  }, []);

  function apply(next: number) {
    setValue(next);
    setChanged(true);
    try { window.localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* optional browser preference */ }
  }

  return <div style={{ minWidth: 210 }}>
    <label style={{ display: "grid", gap: 5, fontSize: 11 }}>
      <span style={{ opacity: .72 }}>Küstenpräzision</span>
      <select value={value} onChange={(event) => apply(Number(event.target.value))} style={{ minHeight: 32 }} aria-label="Genauigkeit der Landmasken-Anpassung">
        {OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
    <div style={{ marginTop: 5, fontSize: 10, opacity: .65 }}>{OPTIONS.find((option) => option.value === value)?.hint}</div>
    {changed ? <button type="button" className="button ghost" style={{ width: "100%", marginTop: 7, minHeight: 30 }} onClick={() => window.location.reload()}>Präzision anwenden</button> : null}
  </div>;
}

export function preferredLandMaskPrecision(fallback = 4096) {
  if (typeof window === "undefined") return fallback;
  try {
    const saved = Number(window.localStorage.getItem(STORAGE_KEY));
    if (OPTIONS.some((option) => option.value === saved)) return saved;
  } catch { /* optional browser preference */ }
  return fallback;
}
