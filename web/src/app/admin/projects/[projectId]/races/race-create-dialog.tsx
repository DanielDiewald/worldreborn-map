"use client";

import { useEffect, useRef, useState } from "react";
import { FormRequiredLegend } from "@/components/form-ui";
import { ProfileImageEditor } from "@/components/profile-image-editor";
import { RaceOriginPicker } from "@/components/race-origin-picker";
import { SubmitButton } from "@/components/submit-button";
import { createRaceAction } from "./actions";
import styles from "./races.module.css";

type RootSpeciesOption = { raceId: number; name: string };
type OriginMap = {
  mapId: number;
  name: string;
  mapType: "image" | "tile";
  tileUrl: string | null;
  imagePath: string | null;
  minZoom: number;
  maxZoom: number;
  centerLat: number | null;
  centerLng: number | null;
  bounds: unknown;
};

export function RaceCreateDialog({ projectId, rootSpecies, maps }: { projectId: number; rootSpecies: RootSpeciesOption[]; maps: OriginMap[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [dirty,setDirty]=useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function requestClose(){
    if(dirty&&!window.confirm("Ungespeicherte Eingaben verwerfen?"))return;
    setOpen(false);setDirty(false);
    window.requestAnimationFrame(()=>triggerRef.current?.focus());
  }

  return <>
    <button ref={triggerRef} type="button" className="button primary" onClick={() => setOpen(true)} aria-haspopup="dialog">＋ Spezies / Subspezies anlegen</button>
    <dialog ref={dialogRef} className={styles.createDialog} aria-labelledby="race-create-title" aria-describedby="race-create-description" onClose={() => {setOpen(false);setDirty(false);}} onCancel={(event) => {event.preventDefault();requestClose();}} onClick={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      {open ? <div className={styles.dialogPanel}>
        <div className={styles.dialogHeader}>
          <div><span className="panel-kicker">NEUER WELTDATENSATZ</span><h2 id="race-create-title">Spezies oder Subspezies anlegen</h2><p id="race-create-description">Lege zuerst die Taxonomie fest. Biologie, Merkmale, Verbreitung und Kulturen kannst du anschließend auf der Detailseite ausbauen.</p></div>
          <button type="button" className={styles.dialogClose} onClick={requestClose} aria-label="Dialog schließen">×</button>
        </div>
        <form action={createRaceAction.bind(null, projectId)} className="stack" onInput={()=>setDirty(true)}>
          <FormRequiredLegend/>
          <section className={styles.formSection}>
            <div className={styles.sectionTitle}><span>01</span><div><strong>Taxonomie</strong><small>Grundbegriff und optionale übergeordnete Spezies</small></div></div>
            <div className="field-grid two">
              <label>Grundbegriff / Name<input name="name" maxLength={120} required placeholder="z. B. Elfen oder Hochelfen" autoFocus/></label>
              <label>Übergeordnete Spezies <span className="muted">optional</span><select name="parentRaceId" defaultValue=""><option value="">Keine – als Haupt-Spezies anlegen</option>{rootSpecies.map((race) => <option key={race.raceId} value={race.raceId}>{race.name}</option>)}</select><small className="muted">Mit Parent entsteht eine Subspezies und erbt fehlende Biologie/Merkmale.</small></label>
            </div>
          </section>
          <section className={styles.formSection}>
            <div className={styles.sectionTitle}><span>02</span><div><strong>Bezeichnungen</strong><small>Optional abhängig vom Geschlecht des Charakters</small></div></div>
            <div className="field-grid two">
              <label>Männliche Bezeichnung <span className="muted">optional</span><input name="masculineName" maxLength={120} placeholder="z. B. Elf"/></label>
              <label>Weibliche Bezeichnung <span className="muted">optional</span><input name="feminineName" maxLength={120} placeholder="z. B. Elfin"/></label>
              <label>Bezeichnung für Hermaphroditen <span className="muted">optional</span><input name="hermaphroditeName" maxLength={120}/></label>
            </div>
          </section>
          <section className={styles.formSection}>
            <div className={styles.sectionTitle}><span>03</span><div><strong>Codex & Erscheinung</strong><small>Beschreibung, Originalbild, optionaler 1:1-Profilzuschnitt und ungefährer Ursprung</small></div></div>
            <label>Biologische / taxonomische Beschreibung <span className="muted">optional</span><textarea name="description" className="large-textarea" maxLength={100000} placeholder="Aussehen, Anatomie, Evolution, Herkunft, besondere körperliche Merkmale …"/></label>
            <ProfileImageEditor label="Vorschaubild der Spezies / Subspezies"/>
            <RaceOriginPicker maps={maps}/>
          </section>
          <div className={styles.dialogActions}><button type="button" className="button ghost" onClick={requestClose}>Abbrechen</button><SubmitButton className="primary" pendingLabel="Datensatz wird angelegt …">Spezies anlegen</SubmitButton></div>
        </form>
      </div> : null}
    </dialog>
  </>;
}
