type Props = {
  current?: string | null;
  pathName?: string;
  fileName?: string;
  label?: string;
};

function validImage(value?: string | null) {
  return Boolean(value && value.trim() && value !== "noimage" && value !== "/noimg.jpg");
}

export function ImageSourceInput({ current, pathName = "image", fileName = "imageFile", label = "Bild / Porträt" }: Props) {
  return <fieldset className="image-source-fieldset">
    <legend>{label}</legend>
    {validImage(current) ? <div className="image-source-preview"><img src={current!} alt="Aktuelles Bild"/><small>Aktuelle Quelle: <code>{current}</code></small></div> : <p className="section-help">Noch kein Bild hinterlegt.</p>}
    <div className="field-grid two">
      <label>Datei hochladen<input name={fileName} type="file" accept="image/jpeg,image/png,image/webp,image/gif"/></label>
      <label>oder Bildpfad / URL<input name={pathName} defaultValue={validImage(current) ? current! : ""} placeholder="/images/... oder https://..."/></label>
    </div>
    <label><input type="checkbox" name={`${pathName}Remove`} value="1"/> Bild entfernen</label>
    <p className="section-help">Ein ausgewählter Upload hat Vorrang vor dem Pfad. Uploads werden über die sichere Media-Library validiert und gespeichert.</p>
  </fieldset>;
}
