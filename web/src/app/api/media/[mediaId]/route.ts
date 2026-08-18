import { NextResponse } from "next/server";
import { hasValidAdminSession } from "@/lib/auth/session";
import { getPlayerSession } from "@/lib/auth/player-session";
import { canPlayerReadMedia, getMediaRecord, readStoredMedia } from "@/lib/media";

export async function GET(_request:Request,{params}:{params:Promise<{mediaId:string}>}){
 const mediaId=Number.parseInt((await params).mediaId,10);if(!Number.isSafeInteger(mediaId)||mediaId<=0)return NextResponse.json({error:"Invalid media ID"},{status:400});
 const record=await getMediaRecord(mediaId);if(!record)return NextResponse.json({error:"Not found"},{status:404});
 const admin=await hasValidAdminSession();if(!admin){const player=await getPlayerSession();if(!player||player.projectId!==record.project_id||!(await canPlayerReadMedia(mediaId,player.projectId,player.playerId)))return NextResponse.json({error:"Not found"},{status:404});}
 if(record.external_url)return NextResponse.redirect(record.external_url);
 if(!record.storage_path)return NextResponse.json({error:"Not found"},{status:404});
 try{const data=await readStoredMedia(record.storage_path);return new Response(new Uint8Array(data),{status:200,headers:{"Content-Type":record.mime_type||"application/octet-stream","Content-Length":String(data.length),"Cache-Control":"private, max-age=300","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; img-src 'self'; sandbox"}});}catch{return NextResponse.json({error:"Not found"},{status:404});}
}
