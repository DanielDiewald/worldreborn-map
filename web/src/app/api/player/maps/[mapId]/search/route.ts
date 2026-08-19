import { NextResponse } from "next/server";
import { getPlayerSession } from "@/lib/auth/player-session";
import { listVisibleMapFeatures } from "@/lib/map-features";
import { getVisibleMapMarkers } from "@/lib/maps";
import { listVisibleNpcsForPlayer } from "@/lib/player-view";
import { listVisibleLocations } from "@/lib/player-world";

function matches(value:string|null|undefined,term:string){return Boolean(value?.toLocaleLowerCase().includes(term));}

export async function GET(request:Request,{params}:{params:Promise<{mapId:string}>}){
  const session=await getPlayerSession();
  if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
  const mapId=Number.parseInt((await params).mapId,10);if(!Number.isSafeInteger(mapId)||mapId<=0)return NextResponse.json({error:"Invalid map ID"},{status:400});
  const term=new URL(request.url).searchParams.get("q")?.trim().toLocaleLowerCase().slice(0,120)??"";
  if(term.length<2)return NextResponse.json({items:[]},{headers:{"Cache-Control":"no-store"}});

  const [features,markers,locations,npcs]=await Promise.all([
    listVisibleMapFeatures(session.projectId,mapId,session.playerId),
    getVisibleMapMarkers(session.projectId,mapId,session.playerId),
    listVisibleLocations(session.projectId,session.playerId),
    listVisibleNpcsForPlayer(session.projectId,session.playerId),
  ]);
  const items:Array<{kind:"location"|"person"|"feature"|"marker";id:number;name:string;subtitle:string|null;featureId:number|null;markerId:number|null;href:null}>=[];
  const seen=new Set<string>();
  const add=(item:(typeof items)[number])=>{const target=item.featureId?`f:${item.featureId}`:item.markerId?`m:${item.markerId}`:`${item.kind}:${item.id}`;if(seen.has(target))return;seen.add(target);items.push(item);};

  for(const location of locations){if(Number(location.map_id)!==mapId||!location.map_feature_id)continue;if(matches(location.name,term)||matches(location.parent_name,term)||matches(location.location_type,term))add({kind:"location",id:location.id,name:location.name,subtitle:location.parent_name?`${location.parent_name} › ${location.name}`:location.location_type,featureId:Number(location.map_feature_id),markerId:null,href:null});}
  for(const npc of npcs){if(Number(npc.mapId)!==mapId||!npc.mapFeatureId||npc.id.startsWith("decoy:"))continue;if(matches(npc.name,term)||matches(npc.title,term)||matches(npc.locationName,term))add({kind:"person",id:Number(npc.id),name:npc.name,subtitle:npc.locationName?`${npc.title??"Person"} · ${npc.locationName}`:npc.title,featureId:Number(npc.mapFeatureId),markerId:null,href:null});}
  for(const feature of features){if(matches(feature.label,term)||matches(feature.short_description,term))add({kind:"feature",id:Number(feature.feature_id),name:feature.label,subtitle:feature.short_description,featureId:Number(feature.feature_id),markerId:null,href:null});}
  for(const marker of markers){if(matches(marker.label,term)||matches(marker.entity_label,term)||matches(marker.short_description,term))add({kind:marker.entity_type==="person"?"person":"marker",id:Number(marker.entity_id??marker.marker_id),name:marker.entity_label||marker.label,subtitle:marker.short_description??marker.label,featureId:null,markerId:Number(marker.marker_id),href:null});}

  return NextResponse.json({items:items.slice(0,16)},{headers:{"Cache-Control":"no-store"}});
}
