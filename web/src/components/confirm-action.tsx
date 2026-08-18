"use client";

import { useRef } from "react";
import { SubmitButton } from "@/components/submit-button";
import styles from "./confirm-action.module.css";

type Action=(formData:FormData)=>void|Promise<void>;

type Props={
  action:Action;
  title:string;
  description:string;
  triggerLabel:string;
  confirmLabel:string;
  pendingLabel?:string;
  triggerClassName?:string;
  confirmClassName?:string;
  hiddenFields?:Record<string,string|number>;
};

export function ConfirmAction({action,title,description,triggerLabel,confirmLabel,pendingLabel="Wird ausgeführt …",triggerClassName="button ghost",confirmClassName="danger",hiddenFields}:Props){
  const dialogRef=useRef<HTMLDialogElement>(null);
  return <form action={action} className={styles.form}>
    {Object.entries(hiddenFields??{}).map(([name,value])=><input key={name} type="hidden" name={name} value={String(value)}/>)}
    <button type="button" className={triggerClassName} onClick={()=>dialogRef.current?.showModal()}>{triggerLabel}</button>
    <dialog ref={dialogRef} className={styles.dialog} onCancel={(event)=>{event.preventDefault();dialogRef.current?.close();}}>
      <div className="stack"><div><span className="panel-kicker">BESTÄTIGUNG</span><h2>{title}</h2><p>{description}</p></div><div className="row end"><button type="button" className="button ghost" onClick={()=>dialogRef.current?.close()}>Abbrechen</button><SubmitButton className={confirmClassName} pendingLabel={pendingLabel}>{confirmLabel}</SubmitButton></div></div>
    </dialog>
  </form>;
}
