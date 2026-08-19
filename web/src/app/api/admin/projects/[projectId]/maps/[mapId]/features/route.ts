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

function countryCandidate(raw:Record<string,unknown>,geometry:JsonMapGeometry,passes:number){
  return{
    ...raw,
    geometry,
    metadata:{
      ...record(raw.metadata),
      serverAdaptedToExistingCountries:passes>0,
      serverAutoFitPasses:passes,
    },
  };
}

async function prepareCountryCreate(projectId:number,mapId:number,body:unknown){
  if(!wantsExistingCountryFit(body)){
    await assertNoPoliticalOverlapForCreate(projectId,mapId,body);
    return{input:body,geometry:null as JsonMapGeometry|null,adjusted:false,passes:0,removedPixels:0};
  }

  const raw=record(body);
  let geometry=raw.geometry as JsonMapGeometry;

  // Fast path: the browser preview is already fitted around existing countries. The server
  // only needs to verify it. This avoids re-rasterizing a large country on every save.
  const initialCandidate=countryCandidate(raw,geometry,0);
  try{
    await assertNoPoliticalOverlapForCreate(projectId,mapId,initialCandidate);
    return{input:initialCandidate,geometry,adjusted:false,passes:0,removedPixels:0};
  }catch{
    // A very thin raster sliver can remain at a shared edge. Only then do the more expensive
    // authoritative recovery passes below.
  }

  const existing=await listMapFeatures(projectId,mapId);
  const blockers=existing
    .filter((row)=>row.location_kind==="country"&&["Polygon","MultiPolygon"].includes(row.geometry.type))
    .map((row)=>row.geometry as JsonMapGeometry);

  let removedPixels=0;
  let lastOverlapError:unknown=null;
  // Two local recovery passes replace the former four 3600px passes. The second, coarser pass
  // intentionally moves a stubborn sub-pixel contour farther away from the occupied neighbour.
  const recoverySizes=[1600,800] as const;
  for(let index=0;index<recoverySizes.length;index+=1){
    const pass=index+1;
    const fit=fitCountryAroundExistingCountries(geometry,blockers,recoverySizes[index]);
    if(!fit||fit.keptPixels<12)throw new Error("Nach dem Anpassen an vorhandene Länder bleibt keine ausreichende freie Fläche übrig. Zeichne weiter in die noch freie Landfläche.");
    geometry=fit.geometry;
    removedPixels+=fit.removedPixels;
    const candidate=countryCandidate(raw,geometry,pass);
    try{
      await assertNoPoliticalOverlapForCreate(projectId,mapId,candidate);
      return{input:candidate,geometry,adjusted:true,passes:pass,removedPixels};
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
    return NextResponse.json({...created,geometry:prepared.geometry,autoFitted:prepared.adjusted,autoFitPasses:prepared.passes,removedOverlapPixels:prepared.removedPixels},{status:201});
  }
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Feature could not be created"},{status:400});}
}
