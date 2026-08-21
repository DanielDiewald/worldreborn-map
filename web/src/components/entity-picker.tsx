"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { RequiredMark } from "./form-ui";
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
  const searchRef=useRef<HTMLInputElement>(null);
  const [value,setValue]=useState(initialValue);
  const [selected,setSelected]=useState<{label:string;kind:string}|null>(initialLabel?{label:initialLabel,kind:initialKind}:null);
  const [query,setQuery]=useState("");
  const [items,setItems]=useState<Item[]>([]);
  const [open,setOpen]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [activeIndex,setActiveIndex]=useState(-1);
  const listboxId=`${id}-listbox`;
  const hintId=hint?`${id}-hint`:undefined;
  const errorId=error?`${id}-error`:undefined;
  const typeKey=types.join(",");

  useEffect(()=>{
    const onPointer=(event:PointerEvent)=>{if(rootRef.current&&!rootRef.current.contains(event.target as Node)){setOpen(false);setActiveIndex(-1);}};
    document.addEventListener("pointerdown",onPointer);
    return()=>document.removeEventListener("pointerdown",onPointer);
  },[]);

  useEffect(()=>{
    if(!open)return;
    const frame=window.requestAnimationFrame(()=>searchRef.current?.focus());
    return()=>window.cancelAnimationFrame(frame);
  },[open]);

  useEffect(()=>{
    if(!open)return;
    const controller=new AbortController();
    const timer=window.setTimeout(async()=>{
      setLoading(true);setError(null);
      try{
        const params=new URLSearchParams({q:query,types:typeKey,limit:"20"});
        if(excludeGroupId)params.set("excludeGroupId",String(excludeGroupId));
        if(excludeFamilyTreeId)params.set("excludeFamilyTreeId",String(excludeFamilyTreeId));
        const response=await fetch(`/api/admin/projects/${projectId}/entities/search?${params.toString()}`,{signal:controller.signal,cache:"no-store"});
        if(!response.ok)throw new Error("Suche fehlgeschlagen");
        const payload=await response.json() as {items?:Item[]};
        const next=Array.isArray(payload.items)?payload.items:[];
        setItems(next);
        setActiveIndex(next.length?0:-1);
      }catch(fetchError){
        if((fetchError as Error).name!=="AbortError"){setError("Entitäten konnten nicht geladen werden.");setItems([]);setActiveIndex(-1);}
      }finally{if(!controller.signal.aborted)setLoading(false);}
    },300);
    return()=>{window.clearTimeout(timer);controller.abort();};
  },[excludeFamilyTreeId,excludeGroupId,open,projectId,query,typeKey]);

  const itemValue=(item:Item)=>includeTypeInValue?`${item.entityType}:${item.entityId}`:String(item.entityId);
  const select=(item:Item)=>{
    setValue(itemValue(item));
    setSelected({label:item.name,kind:item.kind});
    setQuery("");
    setOpen(false);
    setActiveIndex(-1);
  };
  const clear=()=>{setValue("");setSelected(null);setQuery("");setItems([]);setActiveIndex(-1);setOpen(true);};

  function onSearchKeyDown(event:KeyboardEvent<HTMLInputElement>){
    if(event.key==="Escape"){
      if(open){event.preventDefault();setOpen(false);setActiveIndex(-1);}
      return;
    }
    if(event.key==="ArrowDown"){
      event.preventDefault();
      if(!open){setOpen(true);return;}
      setActiveIndex((index)=>items.length?Math.min(items.length-1,index<0?0:index+1):-1);
      return;
    }
    if(event.key==="ArrowUp"){
      event.preventDefault();
      if(!open){setOpen(true);return;}
      setActiveIndex((index)=>items.length?Math.max(0,index<0?items.length-1:index-1):-1);
      return;
    }
    if(event.key==="Home"&&open&&items.length){event.preventDefault();setActiveIndex(0);return;}
    if(event.key==="End"&&open&&items.length){event.preventDefault();setActiveIndex(items.length-1);return;}
    if(event.key==="Enter"&&open&&activeIndex>=0&&items[activeIndex]){
      event.preventDefault();select(items[activeIndex]);
    }
  }

  const describedBy=[hintId,errorId].filter(Boolean).join(" ")||undefined;
  const activeDescendant=open&&activeIndex>=0&&items[activeIndex]?`${id}-option-${items[activeIndex].entityType}-${items[activeIndex].entityId}`:undefined;

  return <div className={styles.field} ref={rootRef}>
    {label?<label htmlFor={id} className={styles.label}>{label}{required?<RequiredMark/>:null}</label>:null}
    <input type="hidden" name={name} value={value}/>
    <div className={`${styles.control}${required&&!value?` ${styles.required}`:""}`}>
      {selected&&!open?<>
        <span className={styles.avatar} aria-hidden="true">{selected.label.slice(0,1).toUpperCase()}</span>
        <button type="button" className={styles.selected} onClick={()=>setOpen(true)} aria-label={`${selected.label} ändern`} aria-haspopup="listbox" aria-expanded={false}>
          <span className={styles.selectedText}><strong>{selected.label}</strong>{selected.kind?<small>{selected.kind}</small>:null}</span>
        </button>
        {allowClear?<button type="button" className={`button ghost ${styles.clear}`} onClick={clear} aria-label="Auswahl entfernen">×</button>:null}
      </>:<>
        <input
          ref={searchRef}
          id={id}
          className={styles.search}
          value={query}
          onChange={(event)=>{setQuery(event.target.value);setOpen(true);}}
          onFocus={()=>setOpen(true)}
          onKeyDown={onSearchKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeDescendant}
          aria-required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          required={required&&!value}
        />
        {loading?<span className={styles.spinner} aria-label="Lädt"/>:null}
      </>}
    </div>
    {hint?<span id={hintId} className={styles.hint}>{hint}</span>:null}
    {error?<span id={errorId} className={styles.error} role="alert">{error}</span>:null}
    {open?<div id={listboxId} className={styles.menu} role="listbox" aria-label={label??"Entität auswählen"}>
      {!loading&&items.length===0?<div className={styles.empty}>{query.trim()?"Keine Treffer":"Tippen oder einen der ersten Treffer wählen."}</div>:items.map((item,index)=>{
        const optionValue=itemValue(item);
        const optionId=`${id}-option-${item.entityType}-${item.entityId}`;
        const active=index===activeIndex;
        return <button
          id={optionId}
          key={`${item.entityType}-${item.entityId}`}
          type="button"
          role="option"
          aria-selected={value===optionValue}
          className={`${styles.option}${active?` ${styles.active}`:""}`}
          onMouseEnter={()=>setActiveIndex(index)}
          onClick={()=>select(item)}
        ><span className={styles.avatar} aria-hidden="true">{item.name.slice(0,1).toUpperCase()}</span><span className={styles.optionText}><strong>{item.name}</strong><small>{[item.kind,item.subtitle].filter(Boolean).join(" · ")}</small></span></button>;
      })}
    </div>:null}
  </div>;
}
