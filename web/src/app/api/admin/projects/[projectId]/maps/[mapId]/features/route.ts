import { NextResponse } from "next/server";
import { hasValidAdminSession } from "@/lib/auth/session";
import { createMapFeature, listMapFeatures } from "@/lib/map-features";
import { assertNoPoliticalOverlapForCreate } from "@/lib/map-political-overlap-guard";
import { fitCountryAroundExistingCountries } from "@/components/map/map-country-fit";
import type { JsonMapGeometry } from "@/components/map/map-geometry-guides";

function positiveInt(value:string){const parsed=Number.parseInt(value,10);return Number.isSafeInteger(parsed)&&parsed>0?parsed:null;}

function record(value:unknown):Record<string,unknown>{return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};}

function wantsExistingCountryFit(body:unknown){
  const raw=record(body),metadata=record(raw.metadata),createLocation=record(raw.createLocation);
  return metadata.adaptToExistingCountries===true&&createLocation.kind==="country"&&Boolean(raw.geometry);
}

function countryCandidate(raw:Record<string,unknown>,geometry:JsonMapGeometry,passes:number,clearancePixels=0){
  return{
    ...raw,
    geometry,
    metadata:{
      ...record(raw.metadata),
      serverAdaptedToExistingCountries:passes>0,
      serverAutoFitPasses:passes,
      serverAutoFitClearancePixels:clearancePixels,
    },
  };
}

async function prepareCountryCreate(projectId:number,mapId:number,body:unknown){
  if(!wantsExistingCountryFit(body)){
    await assertNoPoliticalOverlapForCreate(projectId,mapId,body);
    return{input:body,geometry:null as JsonMapGeometry|null,adjusted:false,passes:0,removedPixels:0,clearancePixels:0};
  }

  const raw=record(body);
  let geometry=raw.geometry as JsonMapGeometry;

  // Fast path: the browser preview may already be conflict-free.
  const initialCandidate=countryCandidate(raw,geometry,0,0);
  try{
    await assertNoPoliticalOverlapForCreate(projectId,mapId,initialCandidate);
    return{input:initialCandidate,geometry,adjusted:false,passes:0,removedPixels:0,clearancePixels:0};
  }catch{
    // Raster previews can leave a very thin vector sliver on an existing border. The recovery
    // path below expands the blocker mask by a tiny local clearance before tracing the new edge.
  }

  const existing=await listMapFeatures(projectId,mapId);
  const blockers=existing
    .filter((row)=>row.location_kind==="country"&&["Polygon","MultiPolygon"].includes(row.geometry.type))
    .map((row)=>row.geometry as JsonMapGeometry);

  let removedPixels=0;
  let lastOverlapError:unknown=null;
  const recoveryPasses=[
    {maxSide:1800,clearancePixels:1},
    {maxSide:1400,clearancePixels:2},
    {maxSide:1000,clearancePixels:3},
  ] as const;

  for(let index=0;index<recoveryPasses.length;index+=1){
    const pass=index+1;
    const recovery=recoveryPasses[index];
    const fit=fitCountryAroundExistingCountries(geometry,blockers,recovery.maxSide,recovery.clearancePixels);
    if(!fit||fit.keptPixels<12)throw new Error("Nach dem Anpassen an vorhandene Länder bleibt keine ausreichende freie Fläche übrig. Zeichne weiter in die noch freie Landfläche.");
    geometry=fit.geometry;
    removedPixels+=fit.removedPixels;
    const candidate=countryCandidate(raw,geometry,pass,recovery.clearancePixels);
    try{
      await assertNoPoliticalOverlapForCreate(projectId,mapId,candidate);
      return{input:candidate,geometry,adjusted:true,passes:pass,removedPixels,clearancePixels:recovery.clearancePixels};
    }catch(error){
      lastOverlapError=error;
    }
  }

  if(lastOverlapError instanceof Error)throw new Error(`Das Nachbarland konnte auch nach automatischer Grenzanpassung nicht konfliktfrei gespeichert werden: ${lastOverlapError.message}`);
  throw new Error("Das Nachbarland konnte nicht konfliktfrei an die bestehenden Länder angepasst werden.");
}

export async function GET(_request:Request,{params}:{params:Promise<{projectId:string;mapId:string}>}){
  if(!(await hasValidAdminSession()))return NextResponse.json({error:"Unauthorized"},{status:401});
  const raw=await params;const projectId=positiveInt(raw.projectId);const mapId=positiveInt(raw.mapId);
  if(!projectId||!mapId)return NextResponse.json({error:"Invalid project or map ID"},{status:400});
  try{return NextResponse.json({features:await listMapFeatures(projectId,mapId)});}catch{return NextResponse.json({error:"Features could not be loaded"},{status:400});}
}

export async function POST(request:Request,{params}:{params:Promise<{projectId:string;mapId:string}>}){
  if(!(await hasValidAdminSession()))return NextResponse.json({error:"Unauthorized"},{status:401});
  const raw=await params;const projectId=positiveInt(raw.projectId);const mapId=positiveInt(raw.mapId);
  if(!projectId||!mapId)return NextResponse.json({error:"Invalid project or map ID"},{status:400});
  try{
    const body=await request.json();
    const prepared=await prepareCountryCreate(projectId,mapId,body);
    const created=await createMapFeature(projectId,mapId,prepared.input);
    return NextResponse.json({...created,geometry:prepared.geometry,autoFitted:prepared.adjusted,autoFitPasses:prepared.passes,autoFitClearancePixels:prepared.clearancePixels,removedOverlapPixels:prepared.removedPixels},{status:201});
  }
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Feature could not be created"},{status:400});}
}
