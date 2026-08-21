"use client";

import { useEffect, useRef, useState } from "react";
import { EntityPicker } from "@/components/entity-picker";
import { SubmitButton } from "@/components/submit-button";
import { createFamilyTreeAction } from "./actions";

export function FamilyTreeCreateDialog({projectId}:{projectId:number}){
  const dialogRef=useRef<HTMLDialogElement>(null);
  const triggerRef=useRef<HTMLButtonElement>(null);
  const [open,setOpen]=useState(false);
  const [dirty,setDirty]=useState(false);
  useEffect(()=>{const dialog=dialogRef.current;if(!dialog)return;if(open&&!dialog.open)dialog.showModal();if(!open&&dialog.open)dialog.close();},[open]);
  function requestClose(){if(dirty&&!window.confirm("Ungespeicherte Eingaben verwerfen?"))return;setOpen(false);setDirty(false);window.requestAnimationFrame(()=>triggerRef.current?.focus());}
  return <>
    <button ref={triggerRef} type="button" className="button primary" onClick={()=>setOpen(true)} aria-haspopup="dialog">＋ Stammbaum</button>
    <dialog ref={dialogRef} className="form-dialog" aria-labelledby="family-tree-create-title" onClose={()=>{setOpen(false);setDirty(false);}} onCancel={(event)=>{event.preventDefault();requestClose();}} onClick={(event)=>{if(event.target===event.currentTarget)requestClose();}}>
      {open?<div className="form-dialog-body">
        <div className="form-dialog-heading"><div><span className="panel-kicker">NEUER FAMILIENZWEIG</span><h2 id="family-tree-create-title">Stammbaum anlegen</h2><p>Alle Angaben sind optional. Ohne Root-Person bleibt der Stammbaum zunächst leer und kann später gezielt aufgebaut werden.</p></div><button type="button" className="button ghost form-dialog-close" onClick={requestClose} aria-label="Dialog schließen">×</button></div>
        <form action={createFamilyTreeAction.bind(null,projectId)} className="stack" onInput={()=>setDirty(true)}>
          <div className="field-grid two"><label>Name <span className="muted">optional</span><input name="name" maxLength={160} autoFocus placeholder="z. B. Haus Valen"/></label><label>Untertitel <span className="muted">optional</span><input name="subtitle" maxLength={240} placeholder="z. B. Königliche Linie"/></label><EntityPicker projectId={projectId} name="rootPersonId" types={["person"]} label="Root-Person" placeholder="Optional eine Person suchen …" hint="Optional · muss zur aktuellen Welt gehören."/><label>Sichtbarkeit<select name="visibilityMode" defaultValue="admin_only"><option value="admin_only">Nur Admin</option><option value="all_players">Alle Spieler</option><option value="selected_players">Ausgewählte Spieler</option></select></label></div>
          <label>Beschreibung <span className="muted">optional</span><textarea name="description" maxLength={100000} placeholder="Worum geht es in diesem Familienzweig?"/></label>
          <div className="form-actions"><button type="button" className="button ghost" onClick={requestClose}>Abbrechen</button><SubmitButton className="primary" pendingLabel="Stammbaum wird erstellt …">Stammbaum erstellen</SubmitButton></div>
        </form>
      </div>:null}
    </dialog>
  </>;
}
