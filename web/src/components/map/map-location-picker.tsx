"use client";

import { useEffect, useState } from "react";
import { locationKindLabel } from "@/lib/location-presentation";
import type { LocationKind } from "@/lib/entities/locations";

type Item={id:number;name:string;kind:LocationKind;parentName:string|null;grandparentName:string|null;pathLabel:string};

export function MapLocationPicker({projectId,parentFor,value,onChange}:{projectId:number;parentFor:LocationKind;value:number|null;onChange:(id:number|null,label?:string)=>void}){
  const [query,setQuery]=useState("");const [items,setItems]=useState<Item[]>([]);const [busy,setBusy]=useState(false);const [selectedLabel,setSelectedLabel]=useState("");
  useEffect(()=>{setQuery("");setItems([]);if(!value)setSelectedLabel("");},[parentFor,value]);
  useEffect(()=>{const controller=new AbortController();const timer=window.setTimeout(async()=>{setBusy(true);try{const response=await fetch(`/api/admin/projects/${projectId}/locations/search?parentFor=${encodeURIComponent(parentFor)}&q=${encodeURIComponent(query)}`,{signal:controller.signal});const body=await response.json().catch(()=>({}));if(response.ok)setItems(Array.isArray(body.items)?body.items:[]);}finally{setBusy(false);}},160);return()=>{controller.abort();window.clearTimeout(timer);};},[projectId,parentFor,query]);
  return <div className="stack" style={{gap:6}}>
    <label>Gehört zu<input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Land, Region oder Provinz suchen …"/></label>
    {value?<div className="row wrap-row"><span className="soft-label">{selectedLabel||`Ort #${value}`}</span><button type="button" className="button ghost" onClick={()=>{onChange(null);setSelectedLabel("");}}>Entfernen</button></div>:null}
    {busy?<small className="muted">Suche …</small>:null}
    {!value&&items.length?<div className="stack" style={{gap:4,maxHeight:190,overflow:"auto"}}>{items.map(item=><button key={item.id} type="button" className="button ghost" style={{textAlign:"left"}} onClick={()=>{onChange(item.id,item.pathLabel);setSelectedLabel(item.pathLabel);setQuery("");setItems([]);}}><strong>{item.name}</strong><br/><small className="muted">{locationKindLabel(item.kind)} · {item.pathLabel}</small></button>)}</div>:null}
    {!value&&!busy&&query&&items.length===0?<small className="muted">Kein passender übergeordneter Ort gefunden.</small>:null}
  </div>;
}
