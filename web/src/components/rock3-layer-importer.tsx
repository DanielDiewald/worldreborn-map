"use client";

import { useState } from "react";

export function Rock3LayerImporter({projectId,mapId}:{projectId:number;mapId:number}){
  const [busy,setBusy]=useState(false),[progress,setProgress]=useState(""),[message,setMessage]=useState(""),[error,setError]=useState("");
  async function submit(formData:FormData){setBusy(true);setMessage("");setError("");const files=formData.getAll("files").filter((value):value is File=>value instanceof File&&value.size>0),setBase=formData.get("setSatelliteAsBase")==="true";let imported=0,skipped=0;try{if(!files.length)throw new Error("Keine Rock-3-Dateien ausgewählt.");for(let index=0;index<files.length;index+=1){const file=files[index];setProgress(`${index+1}/${files.length}: ${file.name}`);const part=new FormData();part.append("files",file,file.name);if(setBase)part.append("setSatelliteAsBase","true");const response=await fetch(`/api/admin/projects/${projectId}/maps/${mapId}/rock3-import`,{method:"POST",body:part});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(`${file.name}: ${body.error||"Import fehlgeschlagen."}`);imported+=Array.isArray(body.imported)?body.imported.length:0;skipped+=Array.isArray(body.skipped)?body.skipped.length:0;}setMessage(`${imported} Rock-3-Layer importiert${skipped?`, ${skipped} Datei(en) nicht erkannt`:""}.`);setProgress("");}catch(e){setError(e instanceof Error?e.message:"Rock-3-Import fehlgeschlagen.");}finally{setBusy(false);}}
  return <form action={submit} className="stack">
    <div><strong>Rock 3 Layer Set</strong><p className="muted">Wähle alle exportierten Rock-3-PNGs gleichzeitig. Sie werden nacheinander hochgeladen und anhand des Dateinamens automatisch als Satellite-, Biom-, Klima-, Höhen- oder Landmasken-Layer registriert.</p></div>
    <input name="files" type="file" accept="image/png,image/webp,image/jpeg" multiple required disabled={busy}/>
    <label className="row"><input name="setSatelliteAsBase" type="checkbox" value="true" defaultChecked disabled={busy}/> Satellite Color als Basemap verwenden</label>
    <button type="submit" className="button primary" disabled={busy}>{busy?"Importiere …":"Rock-3-Paket importieren"}</button>
    {progress?<div className="muted" aria-live="polite">{progress}</div>:null}{message?<div className="success-message" aria-live="polite">{message} <button type="button" className="button ghost" onClick={()=>window.location.reload()}>Layer anzeigen</button></div>:null}{error?<div className="error-message" aria-live="assertive">{error}</div>:null}
  </form>;
}
