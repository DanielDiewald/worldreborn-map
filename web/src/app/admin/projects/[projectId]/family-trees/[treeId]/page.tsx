import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdminSession } from "@/lib/auth/session";
import { getFamilyTreeGraph, listFamilyTreePeople, type FamilyTreeEdge, type FamilyTreeNode } from "@/lib/entities/family-trees";
import { getProject } from "@/lib/projects";
import { addFamilyTreeMemberAction, refreshFamilyTreeAction, removeFamilyTreeMemberAction } from "../actions";
import styles from "../family-trees.module.css";

type Pos={x:number;y:number;generation:number};
const NODE_W=210;const NODE_H=116;const ROW_H=210;

function layoutTree(people:FamilyTreeNode[],edges:FamilyTreeEdge[],rootPersonId:number|null){
  const generationEdges=edges.filter((e)=>e.directed&&["parent","adoptive_parent","step_parent","guardian"].includes(e.code));
  const incoming=new Map<number,number>();for(const edge of generationEdges)incoming.set(edge.b,(incoming.get(edge.b)??0)+1);
  let roots=people.filter((person)=>!incoming.has(person.personId));if(roots.length===0&&people.length)roots=[people.find((p)=>p.personId===rootPersonId)??people[0]];
  const generation=new Map<number,number>();for(const root of roots)generation.set(root.personId,0);
  for(let pass=0;pass<people.length;pass++){let changed=false;for(const edge of generationEdges){const parentGen=generation.get(edge.a);if(parentGen===undefined)continue;const next=parentGen+1;if((generation.get(edge.b)??-1)<next){generation.set(edge.b,next);changed=true;}}if(!changed)break;}
  for(const person of people)if(!generation.has(person.personId))generation.set(person.personId,0);
  const rows=new Map<number,FamilyTreeNode[]>();for(const person of people){const gen=generation.get(person.personId)??0;rows.set(gen,[...(rows.get(gen)??[]),person]);}
  const maxGen=Math.max(0,...rows.keys());const maxCount=Math.max(1,...[...rows.values()].map((row)=>row.length));const width=Math.max(1000,maxCount*(NODE_W+90)+120);const positions=new Map<number,Pos>();
  for(const [gen,row] of [...rows.entries()].sort((a,b)=>a[0]-b[0])){row.sort((a,b)=>a.name.localeCompare(b.name));const usable=width-140-NODE_W;row.forEach((person,index)=>{const x=row.length===1?(width-NODE_W)/2:70+(usable*index)/(row.length-1);positions.set(person.personId,{x,y:50+gen*ROW_H,generation:gen});});}
  return{positions,width,height:Math.max(620,120+(maxGen+1)*ROW_H)};
}

function personHref(projectId:number,node:FamilyTreeNode){return node.kind==="God"?`/admin/projects/${projectId}/gods/${node.personId}`:`/admin/projects/${projectId}/npcs/${node.personId}`;}
function validImage(value:string){return Boolean(value&&value.trim()&&value!=="noimage");}

export default async function FamilyTreeDetailPage({params}:{params:Promise<{projectId:string;treeId:string}>}){
  await requireAdminSession();const raw=await params;const projectId=Number.parseInt(raw.projectId,10);const treeRef=raw.treeId==="all"?"all" as const:Number.parseInt(raw.treeId,10);if(!Number.isSafeInteger(projectId)||projectId<=0||(treeRef!=="all"&&(!Number.isSafeInteger(treeRef)||treeRef<=0)))notFound();
  const [project,graph,peopleChoices]=await Promise.all([getProject(projectId),getFamilyTreeGraph(projectId,treeRef),listFamilyTreePeople(projectId)]);if(!project||!graph)notFound();
  const rootPersonId=Number(graph.tree.root_person_id)||null;const layout=layoutTree(graph.people,graph.edges,rootPersonId);const named=treeRef!=="all";
  const edgeSvg=graph.edges.map((edge)=>{const a=layout.positions.get(edge.a);const b=layout.positions.get(edge.b);if(!a||!b)return null;const ax=a.x+NODE_W/2,ay=a.y+NODE_H/2,bx=b.x+NODE_W/2,by=b.y+NODE_H/2;const parent=edge.directed&&["parent","adoptive_parent","step_parent","guardian"].includes(edge.code);const partner=["spouse","romantic","ex_partner","engaged","widowed_from"].includes(edge.code);let d="";if(parent){const mid=(a.y+NODE_H+b.y)/2;d=`M ${ax} ${a.y+NODE_H} C ${ax} ${mid}, ${bx} ${mid}, ${bx} ${b.y}`;}else{d=`M ${ax} ${ay} C ${(ax+bx)/2} ${ay-18}, ${(ax+bx)/2} ${by-18}, ${bx} ${by}`;}const labelX=(ax+bx)/2,labelY=parent?(a.y+NODE_H+b.y)/2:(ay+by)/2-8;return <g key={`${edge.code}-${edge.a}-${edge.b}-${edge.source}`}><path d={d} className={parent?styles.parentEdge:partner?styles.partnerEdge:styles.otherEdge}/><text x={labelX} y={labelY} textAnchor="middle" className={styles.edgeLabel}>{edge.label}</text></g>;});
  return <AdminShell projectId={projectId} projectName={project.name} section="family-trees" eyebrow={`${project.name} / Stammbäume`} title={graph.tree.name||`Stammbaum #${treeRef}`}>
    <div className="breadcrumb"><Link href={`/admin/projects/${projectId}/family-trees`}>Stammbäume</Link><span>/</span><strong>{graph.tree.name||`Stammbaum #${treeRef}`}</strong></div>
    <div className="page-heading compact-heading"><div><h1>{graph.tree.name||`Stammbaum #${treeRef}`}</h1><p>{graph.tree.subtitle||graph.tree.description||"Visueller Familiengraph mit Generationen und kanonischen Relationships."}</p></div><div className="heading-actions"><Link className="button" href={`/admin/projects/${projectId}/relationships`}>Beziehungen bearbeiten</Link></div></div>
    {named?<div className={styles.toolbar}><section className={`panel-card ${styles.toolCard}`}><h2>Familienzweig synchronisieren</h2><p>Übernimmt alle über Family-Relationships verbundenen Verwandten der Root-Person in diesen benannten Stammbaum.</p><form action={refreshFamilyTreeAction.bind(null,projectId,treeRef)}><button className="primary">↻ Verbundene Familie ergänzen</button></form></section><section className={`panel-card ${styles.toolCard}`}><h2>Person hinzufügen</h2><form action={addFamilyTreeMemberAction.bind(null,projectId,treeRef)} className="stack"><select name="personId" required><option value="">Person wählen …</option>{peopleChoices.map((p)=><option key={p.person_id} value={p.person_id}>{p.name} · {p.kind}</option>)}</select><div className="field-grid two"><input name="roleLabel" placeholder="Rolle im Tree"/><input name="branchLabel" placeholder="Branch / Linie"/></div><button>Hinzufügen</button></form></section></div>:null}
    <div className={styles.legend}><span><i/> Eltern / Kinder</span><span><i className={styles.partner}/> Partner</span><span>{graph.people.length} Personen · {graph.edges.length} Familienkanten</span></div>
    {graph.people.length===0?<div className={`panel-card ${styles.empty}`}>Dieser Stammbaum enthält noch keine Personen.</div>:<div className={styles.canvasShell}><div className={styles.canvas} style={{width:layout.width,height:layout.height}}><svg className={styles.edges} width={layout.width} height={layout.height}>{edgeSvg}</svg>{graph.people.map((node)=>{const pos=layout.positions.get(node.personId);if(!pos)return null;return <div key={node.personId} className={styles.node} style={{left:pos.x,top:pos.y}}><Link href={personHref(projectId,node)}><div className={styles.nodeHead}><span className={styles.avatar}>{validImage(node.image)?<img src={node.image} alt=""/>:node.name.slice(0,1).toUpperCase()}</span><span><strong>{node.name}</strong><small>{node.kind}{node.title?` · ${node.title}`:""}</small></span></div></Link>{node.roleLabel||node.branchLabel?<div className={styles.nodeRole}>{[node.roleLabel,node.branchLabel].filter(Boolean).join(" · ")}</div>:null}{named&&node.personId!==rootPersonId?<form action={removeFamilyTreeMemberAction.bind(null,projectId,treeRef,node.personId)}><button className="button ghost" style={{marginTop:8,minHeight:28,padding:"4px 8px"}}>Aus Tree entfernen</button></form>:null}</div>;})}</div></div>}
  </AdminShell>;
}
