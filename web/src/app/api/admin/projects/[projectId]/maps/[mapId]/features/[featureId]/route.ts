import { NextResponse } from "next/server";
import { hasValidAdminSession } from "@/lib/auth/session";
import { deleteMapFeature, updateMapFeature } from "@/lib/map-features";

function positiveInt(value:string){const parsed=Number.parseInt(value,10);return Number.isSafeInteger(parsed)&&parsed>0?parsed:null;}

export async function PATCH(request:Request,{params}:{params:Promise<{projectId:string;mapId:string;featureId:string}>}){
  if(!(await hasValidAdminSession()))return NextResponse.json({error:"Unauthorized"},{status:401});
  const raw=await params;const projectId=positiveInt(raw.projectId);const mapId=positiveInt(raw.mapId);const featureId=positiveInt(raw.featureId);
  if(!projectId||!mapId||!featureId)return NextResponse.json({error:"Invalid ID"},{status:400});
  try{await updateMapFeature(projectId,mapId,featureId,await request.json());return NextResponse.json({ok:true});}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Feature could not be updated"},{status:400});}
}

export async function DELETE(_request:Request,{params}:{params:Promise<{projectId:string;mapId:string;featureId:string}>}){
  if(!(await hasValidAdminSession()))return NextResponse.json({error:"Unauthorized"},{status:401});
  const raw=await params;const projectId=positiveInt(raw.projectId);const mapId=positiveInt(raw.mapId);const featureId=positiveInt(raw.featureId);
  if(!projectId||!mapId||!featureId)return NextResponse.json({error:"Invalid ID"},{status:400});
  try{await deleteMapFeature(projectId,mapId,featureId);return NextResponse.json({ok:true});}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Feature could not be deleted"},{status:400});}
}
