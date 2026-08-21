"use client";

import { useEffect, useRef, useState } from "react";
import { FormRequiredLegend } from "@/components/form-ui";
import { SubmitButton } from "@/components/submit-button";
import { createProjectAction } from "./actions";

export function ProjectCreateDialog(){
  const dialogRef=useRef<HTMLDialogElement>(null);
  const triggerRef=useRef<HTMLButtonElement>(null);
  const [open,setOpen]=useState(false);
  const [dirty,setDirty]=useState(false);
  useEffect(()=>{const dialog=dialogRef.current;if(!dialog)return;if(open&&!dialog.open)dialog.showModal();if(!open&&dialog.open)dialog.close();},[open]);
  function requestClose(){if(dirty&&!window.confirm("Ungespeicherte Eingaben verwerfen?"))return;setOpen(false);setDirty(false);window.requestAnimationFrame(()=>triggerRef.current?.focus());}
  return <>
    <button ref={triggerRef} type="button" className="button primary" onClick={()=>setOpen(true)} aria-haspopup="dialog">＋ Neue Welt</button>
    <dialog ref={dialogRef} className="form-dialog" aria-labelledby="project-create-title" onClose={()=>{setOpen(false);setDirty(false);}} onCancel={(event)=>{event.preventDefault();requestClose();}} onClick={(event)=>{if(event.target===event.currentTarget)requestClose();}}>
      {open?<div className="form-dialog-body"><div className="form-dialog-heading"><div><span className="panel-kicker">NEUE WELT</span><h2 id="project-create-title">Welt / Projekt anlegen</h2><p>Die Welt wird getrennt von allen anderen Projekten angelegt.</p></div><button type="button" className="button ghost form-dialog-close" onClick={requestClose} aria-label="Dialog schließen">×</button></div><form action={createProjectAction} className="stack" onInput={()=>setDirty(true)}><FormRequiredLegend/><div className="field-grid two"><label>Projektname<input name="name" maxLength={100} placeholder="z. B. Aetherion" required autoFocus/></label><label>Status<input value="Aktiv" readOnly aria-label="Status"/></label></div><label>Beschreibung <span className="muted">optional</span><textarea name="description" maxLength={20000} placeholder="Worum geht es in dieser Welt?"/></label><div className="form-actions"><button type="button" className="button ghost" onClick={requestClose}>Abbrechen</button><SubmitButton className="primary" pendingLabel="Welt wird angelegt …">Welt anlegen</SubmitButton></div></form></div>:null}
    </dialog>
  </>;
}
