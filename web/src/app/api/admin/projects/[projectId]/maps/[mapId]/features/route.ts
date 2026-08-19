import { NextResponse } from "next/server";
import { hasValidAdminSession } from "@/lib/auth/session";
import { createMapFeature, listMapFeatures } from "@/lib/map-features";

function positiveInt(value:string){const parsed=Number.parseInt(value,10);return Number.isSafeInteger(parsed)&&parsed>0?parsed:null;}

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
  try{const featureId=await createMapFeature(projectId,mapId,await request.json());return NextResponse.json({featureId},{status:201});}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Feature could not be created"},{status:400});}
}
