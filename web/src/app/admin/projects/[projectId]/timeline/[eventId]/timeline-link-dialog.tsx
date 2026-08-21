"use client";

import { useEffect, useRef, useState } from "react";
import { EntityPicker } from "@/components/entity-picker";
import { FormRequiredLegend } from "@/components/form-ui";
import { SubmitButton } from "@/components/submit-button";
import { linkTimelineEntityAction } from "../actions";

export function TimelineLinkDialog({projectId,eventId}:{projectId:number;eventId:number}){
  const dialogRef=useRef<HTMLDialogElement>(null);const triggerRef=useRef<HTMLButtonElement>(null);const [open,setOpen]=useState(false);const [dirty,setDirty]=useState(false);
  useEffect(()=>{const dialog=dialogRef.current;if(!dialog)return;if(open&&!dialog.open)dialog.showModal();if(!open&&dialog.open)dialog.close();},[open]);
  function requestClose(){if(dirty&&!window.confirm("Ungespeicherte Eingaben verwerfen?"))return;setOpen(false);setDirty(false);window.requestAnimationFrame(()=>triggerRef.current?.focus());}
  return <><button ref={triggerRef} type="button" className="button primary" onClick={()=>setOpen(true)} aria-haspopup="dialog">＋ Verknüpfen</button><dialog ref={dialogRef} className="form-dialog" aria-labelledby="timeline-link-title" onClose={()=>{setOpen(false);setDirty(false);}} onCancel={(event)=>{event.preventDefault();requestClose();}} onClick={(event)=>{if(event.target===event.currentTarget)requestClose();}}>{open?<div className="form-dialog-body"><div className="form-dialog-heading"><div><span className="panel-kicker">NEUER EREIGNISBEZUG</span><h2 id="timeline-link-title">Entität verknüpfen</h2><p>Die ausgewählte Entität muss zur aktuellen Welt gehören und wird nicht kopiert, sondern kanonisch verknüpft.</p></div><button type="button" className="button ghost form-dialog-close" onClick={requestClose} aria-label="Dialog schließen">×</button></div><form action={linkTimelineEntityAction.bind(null,projectId,eventId)} className="stack" onInput={()=>setDirty(true)}><FormRequiredLegend/><EntityPicker projectId={projectId} name="entityRef" types={["person","group","location"]} label="Person, Gruppe oder Ort" placeholder="Entität suchen …" required allowClear={false} includeTypeInValue/><label>Rolle / Bedeutung <span className="muted">optional</span><input name="role" maxLength={240} placeholder="z. B. Beteiligter, Schauplatz, Verursacher"/></label><div className="form-actions"><button type="button" className="button ghost" onClick={requestClose}>Abbrechen</button><SubmitButton className="primary" pendingLabel="Verknüpfung wird gespeichert …">Entität verknüpfen</SubmitButton></div></form></div>:null}</dialog></>;
}
