"use client";

import { useEffect, useRef, useState } from "react";
import { EntityPicker } from "@/components/entity-picker";
import { FormRequiredLegend } from "@/components/form-ui";
import { PersonGenderSelect } from "@/components/person-gender-select";
import { ProfileImageEditor } from "@/components/profile-image-editor";
import { SubmitButton } from "@/components/submit-button";
import { createNpcAction } from "./actions";

type RaceOption={id:number;name:string;parentName:string|null;isUnknown:boolean};
function raceLabel(race:RaceOption){return race.parentName?`${race.parentName} → ${race.name}`:race.name;}

export function NpcCreateDialog({projectId,races}:{projectId:number;races:RaceOption[]}){
  const dialogRef=useRef<HTMLDialogElement>(null);
  const triggerRef=useRef<HTMLButtonElement>(null);
  const [open,setOpen]=useState(false);
  const [dirty,setDirty]=useState(false);
  const unknownRaceId=races.find((race)=>race.isUnknown)?.id;

  useEffect(()=>{const dialog=dialogRef.current;if(!dialog)return;if(open&&!dialog.open)dialog.showModal();if(!open&&dialog.open)dialog.close();},[open]);
  function requestClose(){if(dirty&&!window.confirm("Ungespeicherte Eingaben verwerfen?"))return;setOpen(false);setDirty(false);window.requestAnimationFrame(()=>triggerRef.current?.focus());}

  return <>
    <button ref={triggerRef} type="button" className="button primary" onClick={()=>setOpen(true)} aria-haspopup="dialog">＋ Neuer NPC</button>
    <dialog ref={dialogRef} className="form-dialog" aria-labelledby="npc-create-title" onClose={()=>{setOpen(false);setDirty(false);}} onCancel={(event)=>{event.preventDefault();requestClose();}} onClick={(event)=>{if(event.target===event.currentTarget)requestClose();}}>
      {open?<div className="form-dialog-body">
        <div className="form-dialog-heading"><div><span className="panel-kicker">NEUER CHARACTER</span><h2 id="npc-create-title">NPC anlegen</h2><p>Lege zuerst Identität, Spezies und aktuellen Ort fest. Lore, Chronologie, Beziehungen und weitere Details kannst du danach im Profil ergänzen.</p></div><button type="button" className="button ghost form-dialog-close" onClick={requestClose} aria-label="Dialog schließen">×</button></div>
        <form action={createNpcAction.bind(null,projectId)} className="stack" onInput={()=>setDirty(true)}>
          <FormRequiredLegend/>
          <input type="hidden" name="alive" value="on"/>
          <section className="stack"><div><span className="panel-kicker">IDENTITÄT</span></div><div className="field-grid two"><label>Name<input name="name" maxLength={100} required autoFocus placeholder="z. B. Lyrana Voss"/></label><label>Geschlecht<PersonGenderSelect defaultValue="unknown"/></label><label>Personen-Titel <span className="muted">optional</span><input name="title" maxLength={120}/></label><label>Beruf / Profession <span className="muted">optional</span><input name="profession" maxLength={120}/></label></div><ProfileImageEditor/></section>
          <section className="stack"><div><span className="panel-kicker">CHARACTER-DATEN</span></div><div className="field-grid two"><EntityPicker projectId={projectId} name="locationId" types={["location"]} label="Aktueller Ort" placeholder="Ort suchen …" required allowClear={false} hint="Pflichtfeld · serverseitige Suche."/><label>Spezies / Subspezies<select name="raceId" required defaultValue={unknownRaceId??""}><option value="" disabled>Bitte auswählen …</option>{races.map((race)=><option key={race.id} value={race.id}>{raceLabel(race)}</option>)}</select></label><label>Klasse <span className="muted">optional</span><input name="className" maxLength={50}/></label><label><input name="follower" type="checkbox"/> Follower</label></div></section>
          <div className="form-actions split"><span className="section-help">Nach dem Anlegen öffnet sich das vollständige NPC-Profil.</span><div className="row"><button type="button" className="button ghost" onClick={requestClose}>Abbrechen</button><SubmitButton className="primary" pendingLabel="NPC wird angelegt …">NPC anlegen</SubmitButton></div></div>
        </form>
      </div>:null}
    </dialog>
  </>;
}
