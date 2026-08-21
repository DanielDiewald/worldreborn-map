"use client";

import { useEffect, useRef, useState } from "react";
import { EntityPicker } from "@/components/entity-picker";
import { FormRequiredLegend } from "@/components/form-ui";
import { ProfileImageEditor } from "@/components/profile-image-editor";
import { SubmitButton } from "@/components/submit-button";
import { createCultureAction } from "./actions";

export function CultureCreateDialog({projectId}:{projectId:number}){
  const dialogRef=useRef<HTMLDialogElement>(null);
  const triggerRef=useRef<HTMLButtonElement>(null);
  const [open,setOpen]=useState(false);
  const [dirty,setDirty]=useState(false);
  useEffect(()=>{const dialog=dialogRef.current;if(!dialog)return;if(open&&!dialog.open)dialog.showModal();if(!open&&dialog.open)dialog.close();},[open]);
  function requestClose(){if(dirty&&!window.confirm("Ungespeicherte Eingaben verwerfen?"))return;setOpen(false);setDirty(false);window.requestAnimationFrame(()=>triggerRef.current?.focus());}
  return <>
    <button ref={triggerRef} type="button" className="button primary" onClick={()=>setOpen(true)} aria-haspopup="dialog">＋ Kultur / Volk</button>
    <dialog ref={dialogRef} className="form-dialog" aria-labelledby="culture-create-title" onClose={()=>{setOpen(false);setDirty(false);}} onCancel={(event)=>{event.preventDefault();requestClose();}} onClick={(event)=>{if(event.target===event.currentTarget)requestClose();}}>
      {open?<div className="form-dialog-body">
        <div className="form-dialog-heading"><div><span className="panel-kicker">NEUER KULTUREINTRAG</span><h2 id="culture-create-title">Kultur oder Volk anlegen</h2><p>Kultur bleibt von Biologie getrennt. Spezies-Verknüpfungen werden nach dem Anlegen auf der Detailseite gepflegt.</p></div><button type="button" className="button ghost form-dialog-close" onClick={requestClose} aria-label="Dialog schließen">×</button></div>
        <form action={createCultureAction.bind(null,projectId)} className="stack" onInput={()=>setDirty(true)}>
          <FormRequiredLegend/>
          <div className="field-grid two"><label>Name<input name="name" maxLength={160} required autoFocus placeholder="z. B. Aelvari"/></label><label>Sichtbarkeit<select name="visibilityMode" defaultValue="admin_only"><option value="admin_only">Nur Admin</option><option value="all_players">Alle Spieler</option><option value="selected_players">Ausgewählte Spieler</option></select></label></div>
          <EntityPicker projectId={projectId} name="primaryLocationId" types={["location"]} label="Kulturelles Kerngebiet" placeholder="Optionalen Ort suchen …" hint="Optional · Land, Region, Provinz, Stadt oder anderer Ort."/>
          <ProfileImageEditor label="Vorschaubild / Symbol"/>
          <label>Beschreibung <span className="muted">optional</span><textarea name="description" className="large-textarea" maxLength={100000} placeholder="Sprache, Bräuche, Kleidung, Gesellschaft, Religion, Geschichte …"/></label>
          <div className="form-actions split"><span className="section-help">Nach dem Anlegen kannst du Spezies und weitere Worldbuilding-Daten verknüpfen.</span><div className="row"><button type="button" className="button ghost" onClick={requestClose}>Abbrechen</button><SubmitButton className="primary" pendingLabel="Kultur wird angelegt …">Kultur anlegen</SubmitButton></div></div>
        </form>
      </div>:null}
    </dialog>
  </>;
}
