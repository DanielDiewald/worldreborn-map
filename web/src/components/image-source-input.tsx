"use client";

import { useEffect, useId, useRef, useState } from "react";
import { EntityImageFrame } from "@/components/entity-image-frame";

type Props = {
  current?: string | null;
  pathName?: string;
  fileName?: string;
  label?: string;
};

const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function validImage(value?: string | null) {
  return Boolean(value && value.trim() && value !== "noimage" && value !== "/noimg.jpg");
}

export function ImageSourceInput({ current, pathName = "image", fileName = "imageFile", label = "Bild / Porträt" }: Props) {
  const id = useId();
  const initial = validImage(current) ? current!.trim() : "";
  const lastServerImageRef=useRef(initial);
  const [pathValue, setPathValue] = useState(initial);
  const [filePreview, setFilePreview] = useState("");
  const [remove, setRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const source = remove ? "" : filePreview || pathValue || initial;

  useEffect(() => () => { if (filePreview.startsWith("blob:")) URL.revokeObjectURL(filePreview); }, [filePreview]);
  useEffect(()=>{
    const next=validImage(current)?current!.trim():"";
    if(lastServerImageRef.current===next)return;
    lastServerImageRef.current=next;
    setPathValue(next);
    setFilePreview("");
    setRemove(false);
    setError(null);
  },[current]);

  function chooseFile(file: File | null) {
    setError(null);
    if (file && !ACCEPTED_IMAGE_TYPES.has(file.type)) {
      setError("Nicht unterstützter Dateityp. Erlaubt sind JPEG, PNG, WebP und GIF.");
      return false;
    }
    if (file && file.size > MAX_IMAGE_BYTES) {
      setError("Das Bild ist größer als 50 MB. Bitte wähle eine kleinere Datei.");
      return false;
    }
    setRemove(false);
    setFilePreview((previous) => {
      if (previous.startsWith("blob:")) URL.revokeObjectURL(previous);
      return file ? URL.createObjectURL(file) : "";
    });
    return true;
  }

  const helpId = `${id}-help`;
  const errorId = error ? `${id}-error` : undefined;

  return <fieldset className="image-source-fieldset">
    <legend>{label}</legend>
    {validImage(source) ? <div className="image-source-preview">
      <EntityImageFrame className="image-source-square-preview" src={source} alt="Bildvorschau"/>
      <small>{filePreview ? "Neue Datei ausgewählt – wird erst beim Speichern übernommen." : `Aktuelle Quelle: ${source}`}</small>
    </div> : <p className="section-help">Noch kein Bild hinterlegt.</p>}
    <div className="field-grid two">
      <label>Datei hochladen
        <input
          name={fileName}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          aria-describedby={[helpId,errorId].filter(Boolean).join(" ")||undefined}
          aria-invalid={Boolean(error)}
          onChange={(event)=>{const file=event.target.files?.[0]??null;if(!chooseFile(file))event.currentTarget.value="";}}
        />
        <small id={helpId} className="form-field-hint">JPEG, PNG, WebP oder GIF · maximal 50 MB. Ein Upload hat Vorrang vor dem Pfad.</small>
        {error?<small id={errorId} className="form-field-error" role="alert">{error}</small>:null}
      </label>
      <label>oder Bildpfad / URL
        <input name={pathName} value={pathValue} onChange={(event)=>{setRemove(false);setError(null);setPathValue(event.target.value);}} placeholder="/images/... oder https://..."/>
      </label>
    </div>
    <label><input type="checkbox" name={`${pathName}Remove`} value="1" checked={remove} onChange={(event)=>{setRemove(event.target.checked);setError(null);}}/> Bild entfernen</label>
    <p className="section-help">Der 1:1-Rahmen schneidet das Original nicht zu: Hoch- und Querformat bleiben vollständig sichtbar. Ein ausgewählter Upload hat Vorrang vor dem Pfad. Leere Dateiauswahl verändert das bestehende Bild nicht.</p>
  </fieldset>;
}
