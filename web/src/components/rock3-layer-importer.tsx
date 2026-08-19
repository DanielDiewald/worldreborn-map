"use client";

import { useState } from "react";

export function Rock3LayerImporter({projectId,mapId}:{projectId:number;mapId:number}){
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");const [error,setError]=useState("");
  async function submit(formData:FormData){setBusy(true);setMessage("");setError("");try{const response=await fetch(`/api/admin/projects/${projectId}/maps/${mapId}/rock3-import`,{method:"POST",body:formData});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||"Rock-3-Import fehlgeschlagen.");const imported=Array.isArray(body.imported)?body.imported.length:0;const skipped=Array.isArray(body.skipped)?body.skipped.length:0;setMessage(`${imported} Rock-3-Layer importiert${skipped?`, ${skipped} Datei(en) nicht erkannt`:""}. Seite neu laden, um sie im Editor zu sehen.`);}catch(e){setError(e instanceof Error?e.message:"Rock-3-Import fehlgeschlagen.");}finally{setBusy(false);}}
  return <form action={submit} className="stack">
    <div><strong>Rock 3 Layer Set</strong><p className="muted">Wähle alle exportierten Rock-3-PNGs gleichzeitig. Dateinamen werden automatisch erkannt; Satellite wird zur Basemap, Klima-, Biom-, Höhen- und Landmasken werden als schaltbare Layer registriert.</p></div>
    <input name="files" type="file" accept="image/png,image/webp,image/jpeg" multiple required disabled={busy}/>
    <label className="row"><input name="setSatelliteAsBase" type="checkbox" value="true" defaultChecked/> Satellite Color als Basemap verwenden</label>
    <button type="submit" className="button primary" disabled={busy}>{busy?"Importiere …":"Rock-3-Paket importieren"}</button>
    {message?<div className="success-message" aria-live="polite">{message}</div>:null}{error?<div className="error-message" aria-live="assertive">{error}</div>:null}
  </form>;
}
