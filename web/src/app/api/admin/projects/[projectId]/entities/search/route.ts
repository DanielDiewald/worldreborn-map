import { NextResponse } from "next/server";
import { hasValidAdminSession } from "@/lib/auth/session";
import { searchProjectEntities, type SearchEntityType } from "@/lib/entity-search";

const ALLOWED_TYPES = new Set<SearchEntityType>(["person","group","location","event"]);

function positive(value:string|null){
  const parsed=Number.parseInt(value??"",10);
  return Number.isSafeInteger(parsed)&&parsed>0?parsed:null;
}

export async function GET(request:Request,{params}:{params:Promise<{projectId:string}>}){
  if(!(await hasValidAdminSession()))return NextResponse.json({error:"Unauthorized"},{status:401});
  const projectId=positive((await params).projectId);
  if(!projectId)return NextResponse.json({error:"Invalid project ID"},{status:400});
  const url=new URL(request.url);
  const requested=(url.searchParams.get("types")??"").split(",").map((value)=>value.trim()).filter(Boolean);
  const types=(requested.length?requested:["person","group","location","event"]).filter((value):value is SearchEntityType=>ALLOWED_TYPES.has(value as SearchEntityType));
  if(!types.length)return NextResponse.json({items:[]},{headers:{"Cache-Control":"no-store"}});
  const limit=Math.max(1,Math.min(25,Number.parseInt(url.searchParams.get("limit")??"20",10)||20));
  const items=await searchProjectEntities({
    projectId,
    query:url.searchParams.get("q")??"",
    types,
    limit,
    excludeGroupId:positive(url.searchParams.get("excludeGroupId")),
    excludeFamilyTreeId:positive(url.searchParams.get("excludeFamilyTreeId")),
  });
  return NextResponse.json({items},{headers:{"Cache-Control":"no-store"}});
}
