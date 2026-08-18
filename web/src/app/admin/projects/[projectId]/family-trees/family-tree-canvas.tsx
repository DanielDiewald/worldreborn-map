"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { groupAncestorRelationships } from "@/lib/family-tree-ancestor-groups";
import { FamilyTreeCanvas as LegacyFamilyTreeCanvas } from "./family-tree-canvas-legacy";
import styles from "./family-trees.module.css";

type TreePerson = { personId:number; name:string; image:string; kind:"God"|"Player Character"|"NPC / Character"; gender:string|null; title:string|null; roleLabel:string|null; branchLabel:string|null; birthYear?:number|null };
type TreeEdge = { a:number; b:number; code:string; label:string; inverseLabel:string|null; directed:boolean; category:string; source:string; metadata:Record<string,unknown> };
type Props = { projectId:number; people:TreePerson[]; edges:TreeEdge[]; rootPersonId:number|null; named:boolean; treeId:number|"all"; savedMainLinePersonIds:number[] };
type NodeBox = { left:number; top:number; width:number; height:number };

function personIdFromTarget(target:Element|null){
  const node=target?.closest<HTMLElement>("[data-tree-node]");
  const href=node?.querySelector<HTMLAnchorElement>("a[href]")?.getAttribute("href")??"";
  const match=href.match(/\/(?:npcs|gods)\/(\d+)(?:[/?#]|$)/);
  const id=match?Number.parseInt(match[1],10):NaN;
  return Number.isSafeInteger(id)&&id>0?id:null;
}

export function FamilyTreeCanvas(props:Props){
  const wrapperRef=useRef<HTMLDivElement>(null);
  const [canvasHost,setCanvasHost]=useState<HTMLElement|null>(null);
  const [canvasSize,setCanvasSize]=useState({width:0,height:0});
  const [nodeBoxes,setNodeBoxes]=useState<Map<number,NodeBox>>(()=>new Map());
  const [hoveredPersonId,setHoveredPersonId]=useState<number|null>(null);
  const ancestorGroups=useMemo(()=>groupAncestorRelationships(props.edges),[props.edges]);

  useEffect(()=>{
    const root=wrapperRef.current;if(!root)return;
    let frame=0;let resizeObserver:ResizeObserver|null=null;
    const scheduleMeasure=()=>{if(frame)cancelAnimationFrame(frame);frame=requestAnimationFrame(measure);};
    const measure=()=>{
      const canvas=root.querySelector<HTMLElement>(`.${styles.canvas}`);if(!canvas)return;
      setCanvasHost((current)=>current===canvas?current:canvas);
      setCanvasSize({width:canvas.offsetWidth,height:canvas.offsetHeight});
      const next=new Map<number,NodeBox>();
      for(const node of canvas.querySelectorAll<HTMLElement>("[data-tree-node]")){
        const id=personIdFromTarget(node);if(!id)continue;
        next.set(id,{left:node.offsetLeft,top:node.offsetTop,width:node.offsetWidth,height:node.offsetHeight});
      }
      setNodeBoxes(next);
      for(const path of canvas.querySelectorAll<SVGPathElement>(`path.${styles.ancestorEdge}`)){
        const group=path.closest<SVGGElement>("g");
        if(!group||group.dataset.ancestorOverlay==="true"||group.dataset.legacyAncestorHidden==="true")continue;
        group.dataset.legacyAncestorHidden="true";group.style.display="none";
      }
      if(!resizeObserver){resizeObserver=new ResizeObserver(scheduleMeasure);resizeObserver.observe(canvas);}
    };
    const mutationObserver=new MutationObserver(scheduleMeasure);
    mutationObserver.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:["style"]});
    scheduleMeasure();window.addEventListener("resize",scheduleMeasure);
    return()=>{if(frame)cancelAnimationFrame(frame);mutationObserver.disconnect();resizeObserver?.disconnect();window.removeEventListener("resize",scheduleMeasure);};
  },[]);

  const onMouseMove=(event:ReactMouseEvent<HTMLDivElement>)=>{
    const id=personIdFromTarget(event.target instanceof Element?event.target:null);
    setHoveredPersonId((current)=>current===id?current:id);
  };

  const overlay=canvasHost?createPortal(
    <svg aria-hidden="true" width={canvasSize.width} height={canvasSize.height} style={{position:"absolute",inset:0,zIndex:1,overflow:"visible",pointerEvents:"none"}}>
      {ancestorGroups.flatMap((group)=>{
        const descendant=nodeBoxes.get(group.descendantId);if(!descendant)return[];
        const visibleAncestors=group.edges.map((edge)=>({edge,box:nodeBoxes.get(edge.a)})).filter((item):item is {edge:TreeEdge;box:NodeBox}=>Boolean(item.box));
        if(!visibleAncestors.length)return[];
        const descendantX=descendant.left+descendant.width/2;const descendantTop=descendant.top;
        const involvedIds=new Set([group.descendantId,...visibleAncestors.map(({edge})=>edge.a)]);
        const highlighted=hoveredPersonId==null||involvedIds.has(hoveredPersonId);
        const className=hoveredPersonId==null?"":highlighted?styles.edgeHighlighted:styles.edgeDimmed;
        if(group.joint&&visibleAncestors.length>1){
          const ancestorXs=visibleAncestors.map(({box})=>box.left+box.width/2);
          const ancestorBottom=Math.max(...visibleAncestors.map(({box})=>box.top+box.height));
          const busY=ancestorBottom+32;const minX=Math.min(...ancestorXs);const maxX=Math.max(...ancestorXs);const hubX=(minX+maxX)/2;
          const routeY=Math.max(busY+30,busY+Math.max(30,(descendantTop-busY)/2));
          return[<g key={`ancestor-joint-${group.descendantId}-${group.ancestorIds.join("-")}`} data-ancestor-overlay="true" className={className}>
            {visibleAncestors.map(({edge,box})=><path key={`${edge.a}-${edge.b}`} d={`M ${box.left+box.width/2} ${box.top+box.height} V ${busY}`} className={styles.ancestorEdge}/>)}
            <path d={`M ${minX} ${busY} H ${maxX}`} className={styles.ancestorEdge}/>
            <path d={`M ${hubX} ${busY} V ${routeY} H ${descendantX} V ${descendantTop}`} className={styles.ancestorEdge}/>
            <text x={hubX} y={busY-8} textAnchor="middle" className={styles.edgeLabel}>Vorfahren</text>
          </g>];
        }
        return visibleAncestors.map(({edge,box},index)=>{
          const ancestorX=box.left+box.width/2;const ancestorBottom=box.top+box.height;
          const middleY=Math.max(ancestorBottom+30,ancestorBottom+Math.max(40,(descendantTop-ancestorBottom)/2)+index*10);
          return <g key={`ancestor-single-${edge.a}-${edge.b}`} data-ancestor-overlay="true" className={className}>
            <path d={`M ${ancestorX} ${ancestorBottom} V ${middleY} H ${descendantX} V ${descendantTop}`} className={styles.ancestorEdge}/>
            <text x={(ancestorX+descendantX)/2} y={middleY-8} textAnchor="middle" className={styles.edgeLabel}>{edge.label||"Vorfahre"}</text>
          </g>;
        });
      })}
    </svg>,canvasHost):null;

  return <div ref={wrapperRef} onMouseMove={onMouseMove} onMouseLeave={()=>setHoveredPersonId(null)}><LegacyFamilyTreeCanvas {...props}/>{overlay}</div>;
}
