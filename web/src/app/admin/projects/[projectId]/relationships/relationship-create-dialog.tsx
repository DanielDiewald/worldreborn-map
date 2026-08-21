"use client";

import { useEffect, useRef, useState } from "react";
import { EntityPicker } from "@/components/entity-picker";
import { FormRequiredLegend } from "@/components/form-ui";
import { SubmitButton } from "@/components/submit-button";
import { createRelationshipAction } from "./actions";

type RelType={relationship_type_id:number;code:string;label:string;inverse_label:string|null;category:string;directed:boolean};
type Preselected={value:string;label:string;kind:string}|null;

export function RelationshipCreateDialog({projectId,types,preselected=null,initialOpen=false}:{projectId:number;types:RelType[];preselected?:Preselected;initialOpen?:boolean}){
  const dialogRef=useRef<HTMLDialogElement>(null);
  const triggerRef=useRef<HTMLButtonElement>(null);
  const [open,setOpen]=useState(initialOpen);
  const [dirty,setDirty]=useState(false);
  useEffect(()=>{const dialog=dialogRef.current;if(!dialog)return;if(open&&!dialog.open)dialog.showModal();if(!open&&dialog.open)dialog.close();},[open]);
  function requestClose(){if(dirty&&!window.confirm("Ungespeicherte Eingaben verwerfen?"))return;setOpen(false);setDirty(false);window.requestAnimationFrame(()=>triggerRef.current?.focus());}
  return <>
    <button ref={triggerRef} type="button" className="button primary" onClick={()=>setOpen(true)} aria-haspopup="dialog">＋ Beziehung</button>
    <dialog ref={dialogRef} className="form-dialog" aria-labelledby="relationship-create-title" onClose={()=>{setOpen(false);setDirty(false);}} onCancel={(event)=>{event.preventDefault();requestClose();}} onClick={(event)=>{if(event.target===event.currentTarget)requestClose();}}>
      {open?<div className="form-dialog-body">
        <div className="form-dialog-heading"><div><span className="panel-kicker">NEUE BEZIEHUNG</span><h2 id="relationship-create-title">Beziehung anlegen</h2><p>Beide Endpunkte werden serverseitig auf die aktuelle Welt geprüft. Beziehungen zu derselben Entität und zyklische Elternbeziehungen werden abgelehnt.</p></div><button type="button" className="button ghost form-dialog-close" onClick={requestClose} aria-label="Dialog schließen">×</button></div>
        <form action={createRelationshipAction.bind(null,projectId)} className="stack" onInput={()=>setDirty(true)}>
          <FormRequiredLegend/>
          <div className="field-grid two"><EntityPicker projectId={projectId} name="entityARef" types={["person","group","location"]} label="Von" placeholder="Person, Gruppe oder Ort suchen …" required allowClear={false} includeTypeInValue initialValue={preselected?.value??""} initialLabel={preselected?.label??""} initialKind={preselected?.kind??""}/><EntityPicker projectId={projectId} name="entityBRef" types={["person","group","location"]} label="Zu" placeholder="Person, Gruppe oder Ort suchen …" required allowClear={false} includeTypeInValue/></div>
          <div className="field-grid two"><label>Beziehungstyp<select name="relationshipTypeId" required defaultValue=""><option value="" disabled>Bitte auswählen …</option>{types.map((type)=><option key={type.relationship_type_id} value={type.relationship_type_id}>{type.category} · {type.label}{type.directed?" →":""}</option>)}</select></label><label>Status<select name="status" defaultValue="active"><option value="active">Aktiv</option><option value="ended">Beendet</option><option value="historical">Historisch</option><option value="unknown">Unbekannt</option></select></label><label>Sichtbarkeit<select name="visibilityMode" defaultValue="admin_only"><option value="admin_only">Nur Admin</option><option value="all_players">Alle Spieler</option><option value="selected_players">Ausgewählte Spieler</option></select></label><label>Hausfolge bei Ehe<select name="houseDescentRule" defaultValue="patrilineal"><option value="patrilineal">Väterlich – Haus des Vaters</option><option value="matrilineal">Matrilinear – Haus der Mutter</option><option value="none">Keine automatische Hauszuordnung</option></select></label></div>
          <div className="field-grid two"><label>Seit / Start <span className="muted">optional</span><input name="startDisplay" maxLength={240}/></label><label>Bis / Ende <span className="muted">optional</span><input name="endDisplay" maxLength={240}/></label></div>
          <label>Öffentliche Beschreibung <span className="muted">optional</span><textarea name="publicDescription" maxLength={100000}/></label><label>Admin-Notizen <span className="muted">optional</span><textarea name="adminNotes" maxLength={100000}/></label>
          <p className="section-help">Die Hausfolge wird nur bei Ehebeziehungen zwischen zwei Personen ausgewertet.</p>
          <div className="form-actions"><button type="button" className="button ghost" onClick={requestClose}>Abbrechen</button><SubmitButton className="primary" pendingLabel="Beziehung wird angelegt …">Beziehung anlegen</SubmitButton></div>
        </form>
      </div>:null}
    </dialog>
  </>;
}
