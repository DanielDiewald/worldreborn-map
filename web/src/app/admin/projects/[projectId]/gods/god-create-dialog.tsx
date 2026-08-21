"use client";

import { useEffect, useRef, useState } from "react";
import { FormRequiredLegend } from "@/components/form-ui";
import { PersonGenderSelect } from "@/components/person-gender-select";
import { ProfileImageEditor } from "@/components/profile-image-editor";
import { SubmitButton } from "@/components/submit-button";
import { createGodAction } from "./actions";

export function GodCreateDialog({projectId}:{projectId:number}){
  const dialogRef=useRef<HTMLDialogElement>(null);
  const triggerRef=useRef<HTMLButtonElement>(null);
  const [open,setOpen]=useState(false);
  const [dirty,setDirty]=useState(false);
  useEffect(()=>{const dialog=dialogRef.current;if(!dialog)return;if(open&&!dialog.open)dialog.showModal();if(!open&&dialog.open)dialog.close();},[open]);
  function requestClose(){if(dirty&&!window.confirm("Ungespeicherte Eingaben verwerfen?"))return;setOpen(false);setDirty(false);window.requestAnimationFrame(()=>triggerRef.current?.focus());}
  return <>
    <button ref={triggerRef} type="button" className="button primary" onClick={()=>setOpen(true)} aria-haspopup="dialog">＋ Gottheit</button>
    <dialog ref={dialogRef} className="form-dialog" aria-labelledby="god-create-title" onClose={()=>{setOpen(false);setDirty(false);}} onCancel={(event)=>{event.preventDefault();requestClose();}} onClick={(event)=>{if(event.target===event.currentTarget)requestClose();}}>
      {open?<div className="form-dialog-body">
        <div className="form-dialog-heading"><div><span className="panel-kicker">NEUE GOTTHEIT</span><h2 id="god-create-title">Gottheit anlegen</h2><p>Erfasse zuerst Identität und Pantheon-Grunddaten. Chronologie und ausführliche Lore können anschließend im Profil ergänzt werden.</p></div><button type="button" className="button ghost form-dialog-close" onClick={requestClose} aria-label="Dialog schließen">×</button></div>
        <form action={createGodAction.bind(null,projectId)} className="stack" onInput={()=>setDirty(true)}>
          <FormRequiredLegend/>
          <section className="stack"><span className="panel-kicker">PERSON</span><div className="field-grid two"><label>Name<input name="name" maxLength={100} required autoFocus placeholder="z. B. Aurelia"/></label><label>Geschlecht<PersonGenderSelect defaultValue="unknown"/></label><label>Personen-Titel <span className="muted">optional</span><input name="personTitle" maxLength={120}/></label><label>Spezies <span className="muted">optional</span><input name="species" maxLength={80}/></label><label>Rolle / Beruf <span className="muted">optional</span><input name="profession" maxLength={120}/></label></div><ProfileImageEditor label="Bild / Darstellung"/></section>
          <section className="stack"><span className="panel-kicker">GÖTTLICHER SUBTYP</span><div className="field-grid two"><label>Göttlicher Titel <span className="muted">optional</span><input name="godTitle" maxLength={30}/></label><label>Domäne <span className="muted">optional</span><input name="domain" maxLength={30}/></label><label>Fraktion / Pantheon <span className="muted">optional</span><input name="faction" maxLength={30}/></label><label>Sichtbarkeit<select name="visibilityMode" defaultValue="admin_only"><option value="admin_only">Nur Admin</option><option value="all_players">Alle Spieler</option><option value="selected_players">Ausgewählte Spieler</option></select></label></div></section>
          <div className="form-actions split"><span className="section-help">Beschreibung, Geburts-/Manifestationsdatum und geheime Notizen folgen auf der Detailseite.</span><div className="row"><button type="button" className="button ghost" onClick={requestClose}>Abbrechen</button><SubmitButton className="primary" pendingLabel="Gottheit wird angelegt …">Gottheit anlegen</SubmitButton></div></div>
        </form>
      </div>:null}
    </dialog>
  </>;
}
