"use client";

import { useEffect, useRef, useState } from "react";
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
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return <>
    <button type="button" className="button primary" onClick={() => setOpen(true)}>＋ Spezies / Subspezies anlegen</button>
    <dialog ref={dialogRef} className={styles.createDialog} onClose={() => setOpen(false)} onCancel={() => setOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      {open ? <div className={styles.dialogPanel}>
        <div className={styles.dialogHeader}>
          <div><span className="panel-kicker">NEUER WELTDATENSATZ</span><h2>Spezies oder Subspezies anlegen</h2><p>Lege zuerst die Taxonomie fest. Biologie, Merkmale, Verbreitung und Kulturen kannst du anschließend auf der Detailseite ausbauen.</p></div>
          <button type="button" className={styles.dialogClose} onClick={() => setOpen(false)} aria-label="Dialog schließen">×</button>
        </div>
        <form action={createRaceAction.bind(null, projectId)} className="stack">
          <section className={styles.formSection}>
            <div className={styles.sectionTitle}><span>01</span><div><strong>Taxonomie</strong><small>Grundbegriff und optionale übergeordnete Spezies</small></div></div>
            <div className="field-grid two">
              <label>Grundbegriff / Name<input name="name" maxLength={120} required placeholder="z. B. Elfen oder Hochelfen" autoFocus/></label>
              <label>Übergeordnete Spezies <span className="muted">optional</span><select name="parentRaceId" defaultValue=""><option value="">Keine – als Haupt-Spezies anlegen</option>{rootSpecies.map((race) => <option key={race.raceId} value={race.raceId}>{race.name}</option>)}</select><small className="muted">Mit Parent entsteht eine Subspezies und erbt fehlende Biologie/Merkmale.</small></label>
            </div>
          </section>
          <section className={styles.formSection}>
            <div className={styles.sectionTitle}><span>02</span><div><strong>Bezeichnungen</strong><small>Optional abhängig vom Geschlecht des Characters</small></div></div>
            <div className="field-grid two">
              <label>Männliche Bezeichnung <span className="muted">optional</span><input name="masculineName" maxLength={120} placeholder="z. B. Elf"/></label>
              <label>Weibliche Bezeichnung <span className="muted">optional</span><input name="feminineName" maxLength={120} placeholder="z. B. Elfin"/></label>
              <label>Bezeichnung für Hermaphroditen <span className="muted">optional</span><input name="hermaphroditeName" maxLength={120}/></label>
            </div>
          </section>
          <section className={styles.formSection}>
            <div className={styles.sectionTitle}><span>03</span><div><strong>Codex & Erscheinung</strong><small>Beschreibung, Originalbild, optionaler 1:1-Profilzuschnitt und ungefährer Ursprung</small></div></div>
            <label>Biologische / taxonomische Beschreibung<textarea name="description" className="large-textarea" maxLength={100000} placeholder="Aussehen, Anatomie, Evolution, Herkunft, besondere körperliche Merkmale …"/></label>
            <ProfileImageEditor label="Vorschaubild der Spezies / Subspezies"/>
            <RaceOriginPicker maps={maps}/>
          </section>
          <div className={styles.dialogActions}><button type="button" className="button ghost" onClick={() => setOpen(false)}>Abbrechen</button><SubmitButton className="primary" pendingLabel="Datensatz wird angelegt …">Spezies anlegen</SubmitButton></div>
        </form>
      </div> : null}
    </dialog>
  </>;
}
