"use client";

import { useEffect, useRef, useState } from "react";
import { FormRequiredLegend } from "@/components/form-ui";
import { SubmitButton } from "@/components/submit-button";
import { createPlayerAction } from "./actions";

export function PlayerCreateDialog({projectId}:{projectId:number}){
  const dialogRef=useRef<HTMLDialogElement>(null);const triggerRef=useRef<HTMLButtonElement>(null);const [open,setOpen]=useState(false);const [dirty,setDirty]=useState(false);
  useEffect(()=>{const dialog=dialogRef.current;if(!dialog)return;if(open&&!dialog.open)dialog.showModal();if(!open&&dialog.open)dialog.close();},[open]);
  function requestClose(){if(dirty&&!window.confirm("Ungespeicherte Eingaben verwerfen?"))return;setOpen(false);setDirty(false);window.requestAnimationFrame(()=>triggerRef.current?.focus());}
  return <><button ref={triggerRef} type="button" className="button primary" onClick={()=>setOpen(true)} aria-haspopup="dialog">＋ Spieler anlegen</button><dialog ref={dialogRef} className="form-dialog" aria-labelledby="player-create-title" onClose={()=>{setOpen(false);setDirty(false);}} onCancel={(event)=>{event.preventDefault();requestClose();}} onClick={(event)=>{if(event.target===event.currentTarget)requestClose();}}>{open?<div className="form-dialog-body"><div className="form-dialog-heading"><div><span className="panel-kicker">NEUER SPIELERZUGANG</span><h2 id="player-create-title">Spieler anlegen</h2><p>Der Zugriffscode wird erst nach dem Anlegen separat generiert und wird serverseitig nur gehasht gespeichert.</p></div><button type="button" className="button ghost form-dialog-close" onClick={requestClose} aria-label="Dialog schließen">×</button></div><form action={createPlayerAction.bind(null,projectId)} className="stack" onInput={()=>setDirty(true)}><FormRequiredLegend/><label>Spielername<input name="name" maxLength={120} required autoFocus autoComplete="off" placeholder="z. B. daniel"/></label><label>Anzeigename <span className="muted">optional</span><input name="displayName" maxLength={120} autoComplete="off" placeholder="z. B. Daniel"/></label><div className="form-actions"><button type="button" className="button ghost" onClick={requestClose}>Abbrechen</button><SubmitButton className="primary" pendingLabel="Spieler wird angelegt …">Spieler anlegen</SubmitButton></div></form></div>:null}</dialog></>;
}
