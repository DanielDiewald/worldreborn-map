"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

export function SubmitButton({children,pendingLabel="Speichere …",className,disabled=false}:{children:ReactNode;pendingLabel?:string;className?:string;disabled?:boolean}){
  const {pending}=useFormStatus();
  return <button type="submit" className={className} disabled={disabled||pending} aria-busy={pending}>{pending?pendingLabel:children}</button>;
}
