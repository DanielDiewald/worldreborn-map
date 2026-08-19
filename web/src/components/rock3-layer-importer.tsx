"use client";

import { useState } from "react";

export function Rock3LayerImporter({projectId,mapId}:{projectId:number;mapId:number}){
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
  async function submit(formData:FormData){
    setBusy(true);setMessage("");setError("");
    try{
      const archive=formData.get("archive");if(!(archive instanceof File)||archive.size===0)throw new Error("Bitte eine Rock-3-ZIP auswählen.");
      const request=new FormData();request.append("archive",archive,archive.name);request.append("setSatelliteAsBase",formData.get("setSatelliteAsBase")==="true"?"true":"false");
      const response=await fetch(`/api/admin/projects/${projectId}/maps/${mapId}/rock3-import`,{method:"POST",body:request});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||"Rock-3-ZIP konnte nicht importiert werden.");
      const imported=Array.isArray(body.imported)?body.imported.length:0,skipped=Array.isArray(body.skipped)?body.skipped.length:0;
      setMessage(`${imported} Rock-3-Karten aus „${archive.name}“ übernommen${skipped?`, ${skipped} unbekannte Datei(en) ignoriert`:""}.`);
    }catch(e){setError(e instanceof Error?e.message:"Rock-3-Import fehlgeschlagen.");}finally{setBusy(false);}
  }
  return <form action={submit} className="stack">
    <div><strong>Rock 3 ZIP importieren</strong><p className="muted">Lade einfach den kompletten Export-Ordner als ZIP hoch. WorldReborn durchsucht auch Unterordner, erkennt die 14 Standardkarten automatisch und legt Satellite, Biome, Niederschlag, Temperatur, Höhenkarten und Land Mask als Layer derselben Weltkarte an.</p></div>
    <input name="archive" type="file" accept=".zip,application/zip,application/x-zip-compressed" required disabled={busy}/>
    <label className="row"><input name="setSatelliteAsBase" type="checkbox" value="true" defaultChecked disabled={busy}/> Satellite Color automatisch als Basemap verwenden</label>
    <button type="submit" className="button primary" disabled={busy}>{busy?"ZIP wird entpackt & importiert …":"Rock-3-ZIP importieren"}</button>
    {message?<div className="success-message" aria-live="polite">{message} <button type="button" className="button ghost" onClick={()=>window.location.reload()}>Layer anzeigen</button></div>:null}{error?<div className="error-message" aria-live="assertive">{error}</div>:null}
  </form>;
}
