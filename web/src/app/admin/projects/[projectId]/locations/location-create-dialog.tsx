"use client";

import { useEffect, useRef, useState } from "react";
import { EntityPicker } from "@/components/entity-picker";
import { FormRequiredLegend } from "@/components/form-ui";
import { ImageSourceInput } from "@/components/image-source-input";
import { SubmitButton } from "@/components/submit-button";
import { createLocationAction } from "./actions";

type KindOption={value:string;label:string};
export function LocationCreateDialog({projectId,kinds,defaultKind="city",parentId=null,parentLabel="",parentKind="",initialOpen=false}:{projectId:number;kinds:KindOption[];defaultKind?:string;parentId?:number|null;parentLabel?:string;parentKind?:string;initialOpen?:boolean}){
  const dialogRef=useRef<HTMLDialogElement>(null);
  const triggerRef=useRef<HTMLButtonElement>(null);
  const [open,setOpen]=useState(initialOpen);
  const [dirty,setDirty]=useState(false);
  useEffect(()=>{const dialog=dialogRef.current;if(!dialog)return;if(open&&!dialog.open)dialog.showModal();if(!open&&dialog.open)dialog.close();},[open]);
  function requestClose(){if(dirty&&!window.confirm("Ungespeicherte Eingaben verwerfen?"))return;setOpen(false);setDirty(false);window.requestAnimationFrame(()=>triggerRef.current?.focus());}
  return <>
    <button ref={triggerRef} type="button" className="button primary" onClick={()=>setOpen(true)} aria-haspopup="dialog">＋ Neuer Ort</button>
    <dialog ref={dialogRef} className="form-dialog" aria-labelledby="location-create-title" onClose={()=>{setOpen(false);setDirty(false);}} onCancel={(event)=>{event.preventDefault();requestClose();}} onClick={(event)=>{if(event.target===event.currentTarget)requestClose();}}>
      {open?<div className="form-dialog-body">
        <div className="form-dialog-heading"><div><span className="panel-kicker">NEUER ORT</span><h2 id="location-create-title">Ort anlegen</h2><p>Lege Name, räumliche Art und optional die übergeordnete Location fest. Kartenplatzierung kann anschließend erfolgen.</p></div><button type="button" className="button ghost form-dialog-close" onClick={requestClose} aria-label="Dialog schließen">×</button></div>
        <form action={createLocationAction.bind(null,projectId)} className="stack" onInput={()=>setDirty(true)}>
          <FormRequiredLegend/>
          <div className="field-grid two"><label>Name<input name="name" required maxLength={100} autoFocus placeholder="z. B. Silberhafen"/></label><label>Art<select name="locationKind" defaultValue={defaultKind}>{kinds.map((kind)=><option key={kind.value} value={kind.value}>{kind.label}</option>)}</select></label><label>Beschreibungstyp <span className="muted">optional</span><input name="locationType" maxLength={80} placeholder="z. B. Freie Handelsstadt"/></label><label>Bevölkerung <span className="muted">optional</span><input name="population" type="number" min="0" step="1"/></label></div>
          <EntityPicker projectId={projectId} name="parentLocId" types={["location"]} label="Gehört zu" placeholder="Land, Provinz oder Stadt suchen …" initialValue={parentId?String(parentId):""} initialLabel={parentLabel} initialKind={parentKind} hint="Optional · Zyklen in der Ortshierarchie werden serverseitig verhindert."/>
          <label>Beschreibung <span className="muted">optional</span><textarea name="description" maxLength={100000}/></label>
          <ImageSourceInput pathName="coatOfArm" fileName="coatOfArmFile" label="Wappen / Bild"/>
          <label>Sichtbarkeit<select name="visibilityMode" defaultValue="admin_only"><option value="admin_only">Nur Admin</option><option value="all_players">Alle Spieler</option><option value="selected_players">Ausgewählte Spieler</option></select></label>
          <div className="form-actions split"><span className="section-help">Herrscher, Hauptstadt, Slug und Kartenobjekt können anschließend im Ortsprofil ergänzt werden.</span><div className="row"><button type="button" className="button ghost" onClick={requestClose}>Abbrechen</button><SubmitButton className="primary" pendingLabel="Ort wird angelegt …">Ort anlegen</SubmitButton></div></div>
        </form>
      </div>:null}
    </dialog>
  </>;
}
