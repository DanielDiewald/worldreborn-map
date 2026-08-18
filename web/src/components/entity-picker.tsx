"use client";

import { useEffect, useId, useRef, useState } from "react";
import styles from "./entity-picker.module.css";

type EntityType="person"|"group"|"location"|"event";
type Item={entityType:EntityType;entityId:number;name:string;kind:string;subtitle:string|null;image:string|null};

type Props={
  projectId:number;
  name:string;
  types:EntityType[];
  label?:string;
  placeholder?:string;
  required?:boolean;
  allowClear?:boolean;
  includeTypeInValue?:boolean;
  initialValue?:string;
  initialLabel?:string;
  initialKind?:string;
  excludeGroupId?:number;
  excludeFamilyTreeId?:number;
  hint?:string;
};

export function EntityPicker({projectId,name,types,label,placeholder="Suchen …",required=false,allowClear=true,includeTypeInValue=false,initialValue="",initialLabel="",initialKind="",excludeGroupId,excludeFamilyTreeId,hint}:Props){
  const id=useId();
  const rootRef=useRef<HTMLDivElement>(null);
  const [value,setValue]=useState(initialValue);
  const [selected,setSelected]=useState<{label:string;kind:string}|null>(initialLabel?{label:initialLabel,kind:initialKind}:null);
  const [query,setQuery]=useState("");
  const [items,setItems]=useState<Item[]>([]);
  const [open,setOpen]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);

  useEffect(()=>{
    const onPointer=(event:PointerEvent)=>{if(rootRef.current&&!rootRef.current.contains(event.target as Node))setOpen(false);};
    document.addEventListener("pointerdown",onPointer);
    return()=>document.removeEventListener("pointerdown",onPointer);
  },[]);

  useEffect(()=>{
    if(!open)return;
    const controller=new AbortController();
    const timer=window.setTimeout(async()=>{
      setLoading(true);setError(null);
      try{
        const params=new URLSearchParams({q:query,types:types.join(","),limit:"20"});
        if(excludeGroupId)params.set("excludeGroupId",String(excludeGroupId));
        if(excludeFamilyTreeId)params.set("excludeFamilyTreeId",String(excludeFamilyTreeId));
        const response=await fetch(`/api/admin/projects/${projectId}/entities/search?${params.toString()}`,{signal:controller.signal,cache:"no-store"});
        if(!response.ok)throw new Error("Suche fehlgeschlagen");
        const payload=await response.json() as {items?:Item[]};
        setItems(Array.isArray(payload.items)?payload.items:[]);
      }catch(fetchError){
        if((fetchError as Error).name!=="AbortError")setError("Entitäten konnten nicht geladen werden.");
      }finally{if(!controller.signal.aborted)setLoading(false);}
    },300);
    return()=>{window.clearTimeout(timer);controller.abort();};
  },[excludeFamilyTreeId,excludeGroupId,open,projectId,query,types]);

  const select=(item:Item)=>{
    setValue(includeTypeInValue?`${item.entityType}:${item.entityId}`:String(item.entityId));
    setSelected({label:item.name,kind:item.kind});
    setQuery("");
    setOpen(false);
  };
  const clear=()=>{setValue("");setSelected(null);setQuery("");setOpen(true);};

  return <div className={styles.field} ref={rootRef}>
    {label?<label htmlFor={id}>{label}</label>:null}
    <input type="hidden" name={name} value={value}/>
    <div className={styles.control}>
      {selected&&!open?<>
        <span className={styles.avatar} aria-hidden="true">{selected.label.slice(0,1).toUpperCase()}</span>
        <button type="button" className={styles.selected} onClick={()=>setOpen(true)} aria-label={`${selected.label} ändern`}>
          <span className={styles.selectedText}><strong>{selected.label}</strong>{selected.kind?<small>{selected.kind}</small>:null}</span>
        </button>
        {allowClear?<button type="button" className={`button ghost ${styles.clear}`} onClick={clear} aria-label="Auswahl entfernen">×</button>:null}
      </>:<>
        <input id={id} className={styles.search} value={query} onChange={(event)=>{setQuery(event.target.value);setOpen(true);}} onFocus={()=>setOpen(true)} placeholder={placeholder} autoComplete="off" role="combobox" aria-expanded={open} aria-controls={`${id}-listbox`} aria-autocomplete="list" required={required&&!value}/>
        {loading?<span className={styles.spinner} aria-label="Lädt"/>:null}
      </>}
    </div>
    {hint?<span className={styles.hint}>{hint}</span>:null}
    {open?<div id={`${id}-listbox`} className={styles.menu} role="listbox">
      {error?<div className={styles.empty}>{error}</div>:!loading&&items.length===0?<div className={styles.empty}>{query.trim()?"Keine Treffer":"Tippen oder einen der ersten Treffer wählen."}</div>:items.map((item)=><button key={`${item.entityType}-${item.entityId}`} type="button" role="option" aria-selected={value===(includeTypeInValue?`${item.entityType}:${item.entityId}`:String(item.entityId))} className={styles.option} onClick={()=>select(item)}><span className={styles.avatar} aria-hidden="true">{item.name.slice(0,1).toUpperCase()}</span><span className={styles.optionText}><strong>{item.name}</strong><small>{[item.kind,item.subtitle].filter(Boolean).join(" · ")}</small></span></button>)}
    </div>:null}
  </div>;
}
