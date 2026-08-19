"use client";

import { useEffect, useRef, useState } from "react";

type MapConfig={mapId:number;mapType:"tile"|"image";tileUrl:string|null;imagePath:string|null;minZoom:number;maxZoom:number;centerLat:number|null;centerLng:number|null;bounds:unknown;config:Record<string,unknown>};
type LayerRow={layer_id:string;name:string;layer_type:"raster"|"vector";source_type:"image"|"tile"|"geojson"|"drawn";source_url:string|null;opacity:number;z_index:number;visible_by_default:boolean;style:Record<string,unknown>;config:Record<string,unknown>};
type FeatureRow={feature_id:string;layer_id:string;geometry:{type:string;coordinates:unknown};label:string;short_description:string|null;style:Record<string,unknown>};
type OlGlobal=Record<string,any>;
declare global{interface Window{ol?:OlGlobal}}

const OL_JS="https://cdn.jsdelivr.net/npm/ol@10.6.1/dist/ol.js";
const OL_CSS="https://cdn.jsdelivr.net/npm/ol@10.6.1/ol.css";

async function ensureOpenLayers(){
  if(window.ol)return window.ol;
  if(!document.querySelector(`link[href="${OL_CSS}"]`)){const link=document.createElement("link");link.rel="stylesheet";link.href=OL_CSS;document.head.appendChild(link);}
  return new Promise<OlGlobal>((resolve,reject)=>{
    const existing=document.querySelector<HTMLScriptElement>(`script[src="${OL_JS}"]`);const script=existing??document.createElement("script");
    const loaded=()=>window.ol?resolve(window.ol):reject(new Error("OpenLayers konnte nicht geladen werden."));
    script.addEventListener("load",loaded,{once:true});script.addEventListener("error",()=>reject(new Error("OpenLayers konnte nicht geladen werden.")),{once:true});
    if(!existing){script.src=OL_JS;script.crossOrigin="anonymous";document.head.appendChild(script);}
  });
}

function parseBounds(value:unknown):[[number,number],[number,number]]|null{
  if(!Array.isArray(value)||value.length!==2||!Array.isArray(value[0])||!Array.isArray(value[1]))return null;
  const a=value[0].map(Number),b=value[1].map(Number);return a.length>=2&&b.length>=2&&a.every(Number.isFinite)&&b.every(Number.isFinite)?[[a[0],a[1]],[b[0],b[1]]]:null;
}

export function OpenLayersMapStudio({projectId,mapConfig,layers,features}:{projectId:number;mapConfig:MapConfig;layers:LayerRow[];features:FeatureRow[]}){
  const targetRef=useRef<HTMLDivElement>(null);const mapRef=useRef<any>(null);const vectorSourceRef=useRef<any>(null);const drawRef=useRef<any>(null);
  const [mode,setMode]=useState<"select"|"Point"|"LineString"|"Polygon">("select");const [layerId,setLayerId]=useState(()=>Number(layers.find(l=>l.layer_type==="vector")?.layer_id??0));
  const [label,setLabel]=useState("");const [status,setStatus]=useState("");const [error,setError]=useState("");

  useEffect(()=>{let active=true;ensureOpenLayers().then(ol=>{
    if(!active||!targetRef.current)return;
    const simple=mapConfig.mapType==="image";const bounds=parseBounds(mapConfig.bounds)??[[0,0],[1000,1000]];const extent=[bounds[0][1],bounds[0][0],bounds[1][1],bounds[1][0]];
    const projection=simple?new ol.proj.Projection({code:`WORLDREBORN:${mapConfig.mapId}`,units:"pixels",extent}):undefined;
    const baseLayers:any[]=[];
    if(simple&&mapConfig.imagePath){const source=mapConfig.imagePath.startsWith("/")?mapConfig.imagePath:`/api/media/${mapConfig.imagePath}`;baseLayers.push(new ol.layer.Image({source:new ol.source.ImageStatic({url:source,projection,imageExtent:extent})}));}
    else if(mapConfig.tileUrl){baseLayers.push(new ol.layer.Tile({source:new ol.source.XYZ({url:mapConfig.tileUrl,wrapX:false,minZoom:mapConfig.minZoom,maxZoom:mapConfig.maxZoom})}));}

    for(const layer of layers.filter(l=>l.layer_type==="raster"&&l.source_url)){
      if(layer.source_type==="image"&&simple)baseLayers.push(new ol.layer.Image({opacity:layer.opacity,zIndex:layer.z_index,visible:layer.visible_by_default,source:new ol.source.ImageStatic({url:layer.source_url,projection,imageExtent:extent})}));
      if(layer.source_type==="tile")baseLayers.push(new ol.layer.Tile({opacity:layer.opacity,zIndex:layer.z_index,visible:layer.visible_by_default,source:new ol.source.XYZ({url:layer.source_url,wrapX:false})}));
    }

    const vectorSource=new ol.source.Vector();vectorSourceRef.current=vectorSource;
    const geojson=new ol.format.GeoJSON();
    for(const row of features){try{const feature=geojson.readFeature({type:"Feature",geometry:row.geometry,properties:{featureId:row.feature_id,label:row.label,layerId:row.layer_id}});vectorSource.addFeature(feature);}catch{/* invalid imported geometry is ignored */}}
    const vectorLayer=new ol.layer.Vector({zIndex:500,source:vectorSource,style:(feature:any)=>{
      const geometryType=feature.getGeometry()?.getType();const isPolygon=geometryType==="Polygon"||geometryType==="MultiPolygon";
      return new ol.style.Style({fill:isPolygon?new ol.style.Fill({color:"rgba(124,110,230,0.28)"}):undefined,stroke:new ol.style.Stroke({color:"#ffffff",width:2}),image:new ol.style.Circle({radius:6,fill:new ol.style.Fill({color:"#7c6ee6"}),stroke:new ol.style.Stroke({color:"#ffffff",width:2})})});
    }});
    const view=simple?new ol.View({projection,center:ol.extent.getCenter(extent),zoom:0,minZoom:mapConfig.minZoom,maxZoom:mapConfig.maxZoom,extent}):new ol.View({center:ol.proj.fromLonLat([mapConfig.centerLng??0,mapConfig.centerLat??0]),zoom:Math.max(mapConfig.minZoom,2),minZoom:mapConfig.minZoom,maxZoom:mapConfig.maxZoom});
    const map=new ol.Map({target:targetRef.current,layers:[...baseLayers,vectorLayer],view});mapRef.current=map;
    if(simple)view.fit(extent,{padding:[24,24,24,24]});
  }).catch(e=>setError(e instanceof Error?e.message:"Karte konnte nicht geladen werden."));return()=>{active=false;mapRef.current?.setTarget(undefined);mapRef.current=null;vectorSourceRef.current=null;};},[mapConfig,layers,features]);

  useEffect(()=>{const map=mapRef.current;if(!map)return;ensureOpenLayers().then(ol=>{
    if(drawRef.current){map.removeInteraction(drawRef.current);drawRef.current=null;}if(mode==="select")return;
    const draw=new ol.interaction.Draw({source:vectorSourceRef.current,type:mode});drawRef.current=draw;map.addInteraction(draw);
    draw.on("drawend",async(event:any)=>{
      const geometry=new ol.format.GeoJSON().writeGeometryObject(event.feature.getGeometry());
      if(!layerId){setError("Bitte zuerst einen Vector-Layer auswählen.");vectorSourceRef.current?.removeFeature(event.feature);return;}
      const featureLabel=label.trim()||`${mode} ${new Date().toLocaleTimeString()}`;
      const response=await fetch(`/api/admin/projects/${projectId}/maps/${mapConfig.mapId}/features`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({layerId,geometry,label:featureLabel,visibilityMode:"admin_only",selectedPlayerIds:[],style:{},metadata:{}})});
      if(!response.ok){const body=await response.json().catch(()=>({}));setError(body.error||"Feature konnte nicht gespeichert werden.");vectorSourceRef.current?.removeFeature(event.feature);return;}
      const body=await response.json();event.feature.set("featureId",body.featureId);event.feature.set("label",featureLabel);setStatus(`„${featureLabel}“ gespeichert.`);setLabel("");
    });
  });return()=>{if(map&&drawRef.current){map.removeInteraction(drawRef.current);drawRef.current=null;}};},[mode,layerId,label,mapConfig.mapId,projectId]);

  return <div style={{display:"grid",gap:12}}>
    <div className="row wrap-row">
      <button type="button" className={mode==="select"?"primary":"button ghost"} onClick={()=>setMode("select")}>Auswählen</button>
      <button type="button" className={mode==="Point"?"primary":"button ghost"} onClick={()=>setMode("Point")}>📍 Punkt</button>
      <button type="button" className={mode==="LineString"?"primary":"button ghost"} onClick={()=>setMode("LineString")}>— Linie</button>
      <button type="button" className={mode==="Polygon"?"primary":"button ghost"} onClick={()=>setMode("Polygon")}>▱ Polygon</button>
      <select value={layerId||""} onChange={e=>setLayerId(Number(e.target.value))} aria-label="Vector Layer"><option value="">Layer wählen</option>{layers.filter(l=>l.layer_type==="vector").map(l=><option key={l.layer_id} value={l.layer_id}>{l.name}</option>)}</select>
      <input value={label} onChange={e=>setLabel(e.target.value)} placeholder="Name, z. B. Königreich Erigon" style={{minWidth:240}}/>
    </div>
    <div ref={targetRef} style={{height:"70vh",minHeight:520,borderRadius:12,overflow:"hidden",background:"#10141a"}}/>
    {status?<div className="muted" aria-live="polite">{status}</div>:null}{error?<div className="error-message" aria-live="assertive">{error}</div>:null}
  </div>;
}
