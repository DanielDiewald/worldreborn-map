import { NextResponse } from "next/server";
import { hasValidAdminSession } from "@/lib/auth/session";
import { updateMapLayerSettings } from "@/lib/map-layer-settings";

function positiveInt(value:string){const parsed=Number.parseInt(value,10);return Number.isSafeInteger(parsed)&&parsed>0?parsed:null;}
export async function PATCH(request:Request,{params}:{params:Promise<{projectId:string;mapId:string;layerId:string}>}){if(!(await hasValidAdminSession()))return NextResponse.json({error:"Unauthorized"},{status:401});const raw=await params;const projectId=positiveInt(raw.projectId),mapId=positiveInt(raw.mapId),layerId=positiveInt(raw.layerId);if(!projectId||!mapId||!layerId)return NextResponse.json({error:"Invalid ID"},{status:400});try{await updateMapLayerSettings(projectId,mapId,layerId,await request.json());return NextResponse.json({ok:true});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Layer could not be updated"},{status:400});}}
