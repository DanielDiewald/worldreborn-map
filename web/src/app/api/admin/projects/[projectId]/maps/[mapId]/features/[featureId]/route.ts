import { NextResponse } from "next/server";
import { hasValidAdminSession } from "@/lib/auth/session";
import { assertMapFeatureUnlocked, patchMapFeatureGeometry, patchMapFeatureGeometryBatch, patchMapFeatureMetadata, patchMapFeaturePresentation, patchMapFeatureStyle } from "@/lib/map-feature-patches";
import { deleteMapFeature, updateMapFeature } from "@/lib/map-features";

function positiveInt(value:string){const parsed=Number.parseInt(value,10);return Number.isSafeInteger(parsed)&&parsed>0?parsed:null;}

export async function PATCH(request:Request,{params}:{params:Promise<{projectId:string;mapId:string;featureId:string}>}){
  if(!(await hasValidAdminSession()))return NextResponse.json({error:"Unauthorized"},{status:401});
  const raw=await params;const projectId=positiveInt(raw.projectId);const mapId=positiveInt(raw.mapId);const featureId=positiveInt(raw.featureId);
  if(!projectId||!mapId||!featureId)return NextResponse.json({error:"Invalid ID"},{status:400});
  try{
    const body=await request.json();
    let result:Record<string,unknown>={};
    if(body?.patchType==="geometry")await patchMapFeatureGeometry(projectId,mapId,featureId,body.geometry);
    else if(body?.patchType==="geometry_batch")await patchMapFeatureGeometryBatch(projectId,mapId,featureId,body.geometry,body.peers);
    else if(body?.patchType==="style")await patchMapFeatureStyle(projectId,mapId,featureId,body.style);
    else if(body?.patchType==="presentation")result=await patchMapFeaturePresentation(projectId,mapId,featureId,{label:body.label,style:body.style,syncLoreName:body.syncLoreName});
    else if(body?.patchType==="metadata")await patchMapFeatureMetadata(projectId,mapId,featureId,body.metadata);
    else await updateMapFeature(projectId,mapId,featureId,body);
    return NextResponse.json({ok:true,...result});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Feature could not be updated"},{status:400});}
}

export async function DELETE(_request:Request,{params}:{params:Promise<{projectId:string;mapId:string;featureId:string}>}){
  if(!(await hasValidAdminSession()))return NextResponse.json({error:"Unauthorized"},{status:401});
  const raw=await params;const projectId=positiveInt(raw.projectId);const mapId=positiveInt(raw.mapId);const featureId=positiveInt(raw.featureId);
  if(!projectId||!mapId||!featureId)return NextResponse.json({error:"Invalid ID"},{status:400});
  try{
    await assertMapFeatureUnlocked(projectId,mapId,featureId);
    const deleted=await deleteMapFeature(projectId,mapId,featureId);
    return NextResponse.json({ok:true,...deleted});
  }
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Feature could not be deleted"},{status:400});}
}
