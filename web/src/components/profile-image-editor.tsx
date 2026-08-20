"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EntityImageFrame, hasEntityImage } from "@/components/entity-image-frame";
import type { EntityImageCrop } from "@/lib/entity-image-crop";

type Props = {
  current?: string | null;
  currentCrop?: EntityImageCrop | null;
  pathName?: string;
  fileName?: string;
  cropName?: string;
  label?: string;
};

const DEFAULT_CROP: EntityImageCrop = { x: 50, y: 50, zoom: 1 };
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function ProfileImageEditor({
  current,
  currentCrop = null,
  pathName = "image",
  fileName = "imageFile",
  cropName = "imageCrop",
  label = "Bild / Porträt",
}: Props) {
  const initialImage = hasEntityImage(current) ? current!.trim() : "";
  const [pathValue, setPathValue] = useState(initialImage);
  const [filePreview, setFilePreview] = useState("");
  const [remove, setRemove] = useState(false);
  const [cropEnabled, setCropEnabled] = useState(Boolean(currentCrop));
  const [crop, setCrop] = useState<EntityImageCrop>(currentCrop ?? DEFAULT_CROP);
  const cropStageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; clientX: number; clientY: number; cropX: number; cropY: number; width: number; height: number } | null>(null);
  const source = remove ? "" : filePreview || pathValue || initialImage;

  useEffect(() => () => { if (filePreview.startsWith("blob:")) URL.revokeObjectURL(filePreview); }, [filePreview]);

  const cropValue = useMemo(() => cropEnabled && hasEntityImage(source) ? JSON.stringify(crop) : "", [cropEnabled, crop, source]);

  function chooseFile(file: File | null) {
    setRemove(false);
    setFilePreview((previous) => {
      if (previous.startsWith("blob:")) URL.revokeObjectURL(previous);
      return file ? URL.createObjectURL(file) : "";
    });
  }

  function startDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!cropEnabled || !cropStageRef.current) return;
    const rect = cropStageRef.current.getBoundingClientRect();
    dragRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, cropX: crop.x, cropY: crop.y, width: rect.width, height: rect.height };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.clientX;
    const dy = event.clientY - drag.clientY;
    setCrop((value) => ({
      ...value,
      x: clamp(drag.cropX - (dx / Math.max(1, drag.width)) * 100 / value.zoom, 0, 100),
      y: clamp(drag.cropY - (dy / Math.max(1, drag.height)) * 100 / value.zoom, 0, 100),
    }));
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return <fieldset className="profile-image-editor">
    <legend>{label}</legend>
    <input type="hidden" name={cropName} value={cropValue}/>

    <div className="profile-image-editor-grid">
      <div className="profile-image-preview-block">
        <span className="panel-kicker">ORIGINAL</span>
        <EntityImageFrame src={source || null} fallback="Bild" className="profile-image-editor-preview"/>
        <small className="section-help">Das vollständige Original bleibt gespeichert und wird nie durch den Zuschnitt ersetzt.</small>
      </div>

      <div className="profile-image-preview-block">
        <span className="panel-kicker">1:1 PROFILZUSCHNITT</span>
        <div
          ref={cropStageRef}
          className={`profile-image-crop-stage${cropEnabled ? " active" : ""}`}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          title={cropEnabled ? "Bild ziehen, um den sichtbaren Ausschnitt zu verschieben" : undefined}
        >
          <EntityImageFrame src={source || null} fallback="Bild" crop={cropEnabled ? crop : null} className="profile-image-editor-preview"/>
          {cropEnabled && hasEntityImage(source) ? <span className="profile-image-crop-hint">Ziehen zum Positionieren</span> : null}
        </div>
        {cropEnabled ? <button type="button" className="button ghost" onClick={() => { setCropEnabled(false); setCrop(DEFAULT_CROP); }}>Zuschnitt entfernen</button> : <button type="button" className="button" disabled={!hasEntityImage(source)} onClick={() => { setCrop(DEFAULT_CROP); setCropEnabled(true); }}>1:1-Zuschnitt anlegen</button>}
      </div>
    </div>

    {cropEnabled && hasEntityImage(source) ? <div className="profile-image-crop-controls">
      <label>Horizontaler Fokus
        <input type="range" min="0" max="100" step="1" value={crop.x} onChange={(event) => setCrop((value) => ({ ...value, x: Number(event.target.value) }))}/>
      </label>
      <label>Vertikaler Fokus
        <input type="range" min="0" max="100" step="1" value={crop.y} onChange={(event) => setCrop((value) => ({ ...value, y: Number(event.target.value) }))}/>
      </label>
      <label>Zoom · {crop.zoom.toFixed(2)}×
        <input type="range" min="1" max="4" step="0.05" value={crop.zoom} onChange={(event) => setCrop((value) => ({ ...value, zoom: Number(event.target.value) }))}/>
      </label>
      <button type="button" className="button ghost" onClick={() => setCrop(DEFAULT_CROP)}>Zuschnitt zentrieren</button>
    </div> : null}

    <div className="field-grid two profile-image-source-fields">
      <label>Datei hochladen
        <input name={fileName} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}/>
      </label>
      <label>oder Bildpfad / URL
        <input name={pathName} value={pathValue} onChange={(event) => { setRemove(false); setPathValue(event.target.value); }} placeholder="/images/... oder https://..."/>
      </label>
    </div>
    <label><input type="checkbox" name={`${pathName}Remove`} value="1" checked={remove} onChange={(event) => { setRemove(event.target.checked); if (event.target.checked) setCropEnabled(false); }}/> Bild entfernen</label>
    <p className="section-help">Der 1:1-Zuschnitt ist optional. Ohne gespeicherten Zuschnitt zeigt WorldReborn weiterhin das vollständige Original im quadratischen Rahmen.</p>
  </fieldset>;
}
