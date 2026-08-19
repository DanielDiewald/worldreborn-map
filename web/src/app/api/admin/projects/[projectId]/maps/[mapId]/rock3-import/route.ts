import { NextResponse } from "next/server";
import { hasValidAdminSession } from "@/lib/auth/session";
import { importRock3Archive,importRock3Files } from "@/lib/rock3-map-set";

export const runtime="nodejs";

function positiveInt(value:string){const parsed=Number.parseInt(value,10);return Number.isSafeInteger(parsed)&&parsed>0?parsed:null;}

export async function POST(request:Request,{params}:{params:Promise<{projectId:string;mapId:string}>}){
  if(!(await hasValidAdminSession()))return NextResponse.json({error:"Unauthorized"},{status:401});
  const raw=await params;const projectId=positiveInt(raw.projectId);const mapId=positiveInt(raw.mapId);
  if(!projectId||!mapId)return NextResponse.json({error:"Invalid project or map ID"},{status:400});
  try{
    const form=await request.formData(),setSatelliteAsBase=form.get("setSatelliteAsBase")!=="false";
    const archive=form.get("archive");
    if(archive instanceof File&&archive.size>0){const result=await importRock3Archive(projectId,mapId,archive,{setSatelliteAsBase});return NextResponse.json(result,{status:201});}
    // Keep the old multi-file API compatible for existing clients/scripts.
    const files=form.getAll("files").filter((value):value is File=>value instanceof File&&value.size>0);
    if(!files.length)return NextResponse.json({error:"Keine Rock-3-ZIP oder Bilder ausgewählt."},{status:400});
    const result=await importRock3Files(projectId,mapId,files,{setSatelliteAsBase});return NextResponse.json(result,{status:201});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Rock-3-Import fehlgeschlagen."},{status:400});}
}
