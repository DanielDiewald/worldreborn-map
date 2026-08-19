import { NextResponse } from "next/server";
import { hasValidAdminSession } from "@/lib/auth/session";
import { LOCATION_KINDS, type LocationKind } from "@/lib/entities/locations";
import { searchLocationsForParent } from "@/lib/location-search";

function positiveInt(value:string){const parsed=Number.parseInt(value,10);return Number.isSafeInteger(parsed)&&parsed>0?parsed:null;}

export async function GET(request:Request,{params}:{params:Promise<{projectId:string}>}){
  if(!(await hasValidAdminSession()))return NextResponse.json({error:"Unauthorized"},{status:401});
  const projectId=positiveInt((await params).projectId);if(!projectId)return NextResponse.json({error:"Invalid project ID"},{status:400});
  const url=new URL(request.url);const rawKind=url.searchParams.get("parentFor");const parentFor=rawKind&&LOCATION_KINDS.includes(rawKind as LocationKind)?rawKind as LocationKind:null;
  const items=await searchLocationsForParent(projectId,url.searchParams.get("q")??"",parentFor);
  return NextResponse.json({items},{headers:{"Cache-Control":"no-store"}});
}
