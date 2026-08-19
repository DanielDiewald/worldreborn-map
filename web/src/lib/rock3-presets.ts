export type Rock3LayerPreset={role:string;name:string;match:string[];opacity:number;zIndex:number;visible:boolean;category:string};

export const ROCK3_LAYER_PRESETS:Rock3LayerPreset[]=[
  {role:"satellite",name:"Satellite",match:["satellite color"],opacity:1,zIndex:0,visible:true,category:"terrain"},
  {role:"biomes",name:"Biomes · Köppen-Geiger",match:["biomes koppen-geiger","biomes köppen-geiger"],opacity:.72,zIndex:20,visible:false,category:"climate"},
  {role:"rainfall_annual",name:"Rainfall · Annual Total",match:["rainfall annual total"],opacity:.72,zIndex:30,visible:false,category:"climate"},
  {role:"rainfall_equinox",name:"Rainfall · Equinox",match:["rainfall equinox"],opacity:.72,zIndex:31,visible:false,category:"climate"},
  {role:"rainfall_summer",name:"Rainfall · Summer",match:["rainfall summer"],opacity:.72,zIndex:32,visible:false,category:"climate"},
  {role:"rainfall_winter",name:"Rainfall · Winter",match:["rainfall winter"],opacity:.72,zIndex:33,visible:false,category:"climate"},
  {role:"temperature_annual",name:"Temperature · Annual Mean",match:["temperature annual mean"],opacity:.72,zIndex:40,visible:false,category:"climate"},
  {role:"temperature_equinox",name:"Temperature · Equinox",match:["temperature equinox"],opacity:.72,zIndex:41,visible:false,category:"climate"},
  {role:"temperature_summer",name:"Temperature · Summer",match:["temperature summer"],opacity:.72,zIndex:42,visible:false,category:"climate"},
  {role:"temperature_winter",name:"Temperature · Winter",match:["temperature winter"],opacity:.72,zIndex:43,visible:false,category:"climate"},
  {role:"elevation_land",name:"Terrain · Elevation Above Sea Level",match:["terrain elevation above sea level"],opacity:.75,zIndex:50,visible:false,category:"terrain"},
  {role:"elevation_sea",name:"Terrain · Elevation Below Sea Level",match:["terrain elevation below sea level"],opacity:.75,zIndex:51,visible:false,category:"terrain"},
  {role:"elevation_full",name:"Terrain · Full Elevation",match:["terrain full elevation"],opacity:.75,zIndex:52,visible:false,category:"terrain"},
  {role:"land_mask",name:"Terrain · Land Mask",match:["terrain land mask"],opacity:.58,zIndex:60,visible:false,category:"editing"},
];

function normalize(name:string){return name.toLowerCase().replace(/\.[^.]+$/g,"").replace(/[–—_-]+/g," ").replace(/[^a-z0-9äöüß ]+/g," ").replace(/\s+/g," ").trim();}
export function detectRock3Preset(filename:string){const normalized=normalize(filename);return ROCK3_LAYER_PRESETS.find(p=>p.match.some(m=>normalized.includes(normalize(m))))??null;}
