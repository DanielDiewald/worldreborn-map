import { PlayerShell } from "@/components/player-shell";
import { requirePlayerSession } from "@/lib/auth/player-session";
import { getPlayerContext } from "@/lib/player-view";
import { getMyCharacter } from "@/lib/player-world";

export default async function MyCharacterPage(){
  const session=await requirePlayerSession();
  const [context,character]=await Promise.all([getPlayerContext(session.projectId,session.playerId),getMyCharacter(session.projectId,session.playerId)]);
  if(!context)return null;
  return <PlayerShell projectName={context.project_name} playerName={context.player_name}>
    <div className="page-heading compact-heading"><div><span className="eyebrow">Player / My Character</span><h1>Mein Charakter</h1></div></div>
    {character?<section className="panel-card stack">
      <div className="entity-cell"><span className="entity-avatar hero-avatar">{character.image&&character.image!=="noimage"?<img src={character.image} alt=""/>:character.name.slice(0,1)}</span><span><h2>{character.name}</h2><small>{character.race} · {character.class} · {character.age}</small></span></div>
      <p>{character.public_description||"Keine öffentliche Beschreibung hinterlegt."}</p>
      <div className="row wrap-row"><span className="soft-label">{character.race_path}</span><span className="soft-label">{character.alive?"Lebendig":"Tot"}</span><span className="soft-label">Ort: {character.location_name}</span></div>
      {character.ancestry.length>0?<div><strong>Bekannte Abstammung</strong><div className="row wrap-row" style={{marginTop:8}}>{character.ancestry.map((entry)=><span className="soft-label" key={entry}>{entry}</span>)}</div></div>:null}
      {character.cultures.length>0?<div><strong>Kultur / Volk</strong><div className="row wrap-row" style={{marginTop:8}}>{character.cultures.map((culture)=><span className="soft-label" key={culture}>{culture}</span>)}</div></div>:null}
    </section>:<section className="panel-card empty-state large"><strong>Noch kein Charakter zugewiesen</strong><span>Die Spielleitung kann dir einen Spielercharakter zuordnen.</span></section>}
  </PlayerShell>;
}
