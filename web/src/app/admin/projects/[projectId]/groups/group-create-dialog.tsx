"use client";

import { useEffect, useRef, useState } from "react";
import { EntityPicker } from "@/components/entity-picker";
import { FormRequiredLegend } from "@/components/form-ui";
import { ImageSourceInput } from "@/components/image-source-input";
import { SubmitButton } from "@/components/submit-button";
import { createGroupAction } from "./actions";

export function GroupCreateDialog({projectId}:{projectId:number}){
  const dialogRef=useRef<HTMLDialogElement>(null);
  const triggerRef=useRef<HTMLButtonElement>(null);
  const [open,setOpen]=useState(false);
  const [dirty,setDirty]=useState(false);
  useEffect(()=>{const dialog=dialogRef.current;if(!dialog)return;if(open&&!dialog.open)dialog.showModal();if(!open&&dialog.open)dialog.close();},[open]);
  function requestClose(){if(dirty&&!window.confirm("Ungespeicherte Eingaben verwerfen?"))return;setOpen(false);setDirty(false);window.requestAnimationFrame(()=>triggerRef.current?.focus());}
  return <>
    <button ref={triggerRef} type="button" className="button primary" onClick={()=>setOpen(true)} aria-haspopup="dialog">＋ Gruppe</button>
    <dialog ref={dialogRef} className="form-dialog" aria-labelledby="group-create-title" onClose={()=>{setOpen(false);setDirty(false);}} onCancel={(event)=>{event.preventDefault();requestClose();}} onClick={(event)=>{if(event.target===event.currentTarget)requestClose();}}>
      {open?<div className="form-dialog-body">
        <div className="form-dialog-heading"><div><span className="panel-kicker">NEUE ORGANISATION</span><h2 id="group-create-title">Gruppe oder Fraktion anlegen</h2><p>Name und Hauptquartier reichen für den Start. Mitglieder und ausführliche Details folgen anschließend.</p></div><button type="button" className="button ghost form-dialog-close" onClick={requestClose} aria-label="Dialog schließen">×</button></div>
        <form action={createGroupAction.bind(null,projectId)} className="stack" onInput={()=>setDirty(true)}>
          <FormRequiredLegend/>
          <div className="field-grid two"><label>Name<input name="name" maxLength={100} required autoFocus placeholder="z. B. Orden der Morgenwacht"/></label><label>Typ <span className="muted">optional</span><input name="groupType" maxLength={80} placeholder="z. B. Orden, Staat, Gilde"/></label><EntityPicker projectId={projectId} name="locationId" types={["location"]} label="Hauptquartier" placeholder="Ort suchen …" required allowClear={false} hint="Pflichtfeld · muss zur aktuellen Welt gehören."/><label>Motto <span className="muted">optional</span><input name="motto" maxLength={10000}/></label><label>Sichtbarkeit<select name="visibilityMode" defaultValue="admin_only"><option value="admin_only">Nur Admin</option><option value="all_players">Alle Spieler</option><option value="selected_players">Ausgewählte Spieler</option></select></label></div>
          <ImageSourceInput label="Bild / Wappen"/>
          <label>Kurze interne Notiz <span className="muted">optional</span><textarea name="notes" maxLength={100000}/></label>
          <div className="form-actions split"><span className="section-help">Bekannte Mitglieder, Ränge und Beziehungen werden nach dem Anlegen gepflegt.</span><div className="row"><button type="button" className="button ghost" onClick={requestClose}>Abbrechen</button><SubmitButton className="primary" pendingLabel="Gruppe wird angelegt …">Gruppe anlegen</SubmitButton></div></div>
        </form>
      </div>:null}
    </dialog>
  </>;
}
