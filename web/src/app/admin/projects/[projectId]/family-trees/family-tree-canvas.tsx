"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition, type FocusEvent as ReactFocusEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  FAMILY_NODE_HEIGHT,
  FAMILY_NODE_WIDTH,
  assignFamilyParentRouteLanes,
  buildFamilyGenerations,
  findFamilyDescendantLine,
  isFamilyParentEdge,
  isFamilyStructureEdge,
  layoutFamilyTree,
  resolveFamilyMainLine,
  type FamilyParentRoute,
  type FamilyTreePosition,
} from "@/lib/family-tree-layout";
import { removeFamilyTreeMemberAction, updateFamilyTreeMainLineAction } from "./actions";
import styles from "./family-trees.module.css";

type TreePerson = {
  personId: number;
  name: string;
  image: string;
  kind: "God" | "Player Character" | "NPC / Character";
  title: string | null;
  roleLabel: string | null;
  branchLabel: string | null;
  birthYear?: number | null;
};

type TreeEdge = {
  a: number;
  b: number;
  code: string;
  label: string;
  inverseLabel: string | null;
  directed: boolean;
  category: string;
  source: string;
};

type Props = {
  projectId: number;
  people: TreePerson[];
  edges: TreeEdge[];
  rootPersonId: number | null;
  named: boolean;
  treeId: number | "all";
  savedMainLinePersonIds: number[];
};

type ResolvedFamilyUnit = {
  key: string;
  routeId: number;
  generation: number;
  parentIds: number[];
  parents: Array<{ id: number; pos: FamilyTreePosition }>;
  children: Array<{ id: number; pos: FamilyTreePosition; edges: TreeEdge[] }>;
  startX: number;
  endX: number;
};

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.1;
const WHEEL_ZOOM_STEP = 0.05;
const INTERACTIVE_SELECTOR = "a,button,input,select,textarea,summary,label,form";

function clampZoom(value: number) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(value * 100) / 100));
}

function personHref(projectId: number, node: TreePerson) {
  return node.kind === "God" ? `/admin/projects/${projectId}/gods/${node.personId}` : `/admin/projects/${projectId}/npcs/${node.personId}`;
}

function validImage(value: string) {
  return Boolean(value && value.trim() && value !== "noimage" && value !== "/noimg.jpg");
}

function edgeKey(edge: TreeEdge) {
  return `${edge.code}-${edge.a}-${edge.b}-${edge.source}`;
}

function pairKeyForEdge(edge: TreeEdge) {
  return edge.a < edge.b ? `${edge.a}:${edge.b}` : `${edge.b}:${edge.a}`;
}

function collectBranchMap(mainLine: number[], edges: TreeEdge[]) {
  const mainSet = new Set(mainLine);
  const result = new Map<number, Set<number>>(mainLine.map((id) => [id, new Set<number>()]));
  const adjacency = new Map<number, Set<number>>();
  for (const edge of edges) {
    const a = adjacency.get(edge.a) ?? new Set<number>();
    const b = adjacency.get(edge.b) ?? new Set<number>();
    a.add(edge.b); b.add(edge.a); adjacency.set(edge.a, a); adjacency.set(edge.b, b);
  }
  const offMain = new Set<number>();
  for (const edge of edges) {
    if (!mainSet.has(edge.a)) offMain.add(edge.a);
    if (!mainSet.has(edge.b)) offMain.add(edge.b);
  }
  const visited = new Set<number>();
  for (const start of offMain) {
    if (visited.has(start)) continue;
    const component = new Set<number>();
    const anchors = new Set<number>();
    const queue = [start];
    visited.add(start);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const id = queue[cursor];
      component.add(id);
      for (const next of adjacency.get(id) ?? []) {
        if (mainSet.has(next)) anchors.add(next);
        else if (!visited.has(next)) { visited.add(next); queue.push(next); }
      }
    }
    for (const anchor of anchors) {
      const branch = result.get(anchor) ?? new Set<number>();
      for (const id of component) branch.add(id);
      result.set(anchor, branch);
    }
  }
  return result;
}

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(INTERACTIVE_SELECTOR));
}

export function FamilyTreeCanvas({ projectId, people, edges, rootPersonId, named, treeId, savedMainLinePersonIds }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const centeredInitially = useRef(false);
  const panState = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null);
  const [expandedAnchors, setExpandedAnchors] = useState<Set<number>>(() => new Set());
  const [showAll, setShowAll] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [editingMainLine, setEditingMainLine] = useState(false);
  const [persistedMainLine, setPersistedMainLine] = useState<number[] | null>(() => savedMainLinePersonIds.length ? savedMainLinePersonIds : null);
  const [draftMainLine, setDraftMainLine] = useState<number[]>([]);
  const [mainLineError, setMainLineError] = useState<string | null>(null);
  const [hoveredPersonId, setHoveredPersonId] = useState<number | null>(null);
  const [savingMainLine, startMainLineTransition] = useTransition();

  const structuralEdges = useMemo(() => edges.filter((edge) => edge.category === "family" && isFamilyStructureEdge(edge)), [edges]);
  const automaticMainLine = useMemo(() => resolveFamilyMainLine(people, structuralEdges, null, rootPersonId), [people, structuralEdges, rootPersonId]);
  const storedMainLine = useMemo(() => resolveFamilyMainLine(people, structuralEdges, persistedMainLine, rootPersonId), [people, structuralEdges, persistedMainLine, rootPersonId]);
  const mainLine = editingMainLine && draftMainLine.length ? draftMainLine : storedMainLine;
  const mainLineSet = useMemo(() => new Set(mainLine), [mainLine]);
  const baseGenerations = useMemo(() => buildFamilyGenerations(people, structuralEdges), [people, structuralEdges]);
  const personById = useMemo(() => new Map(people.map((person) => [person.personId, person])), [people]);
  const childrenByParent = useMemo(() => {
    const result = new Map<number, number[]>();
    for (const edge of structuralEdges) {
      if (!isFamilyParentEdge(edge)) continue;
      result.set(edge.a, [...(result.get(edge.a) ?? []), edge.b]);
    }
    for (const [parentId, childIds] of result) {
      result.set(parentId, [...new Set(childIds)].sort((a, b) => (baseGenerations.get(a) ?? 0) - (baseGenerations.get(b) ?? 0) || (personById.get(a)?.name ?? "").localeCompare(personById.get(b)?.name ?? "") || a - b));
    }
    return result;
  }, [baseGenerations, structuralEdges, personById]);

  const branchNodes = useMemo(() => collectBranchMap(mainLine, structuralEdges), [structuralEdges, mainLine]);

  const visibleIds = useMemo(() => {
    if (editingMainLine || showAll) return new Set(people.map((person) => person.personId));
    const result = new Set(mainLine);
    for (const anchor of expandedAnchors) for (const personId of branchNodes.get(anchor) ?? []) result.add(personId);
    return result;
  }, [branchNodes, editingMainLine, expandedAnchors, mainLine, people, showAll]);

  const visibleNodes = useMemo(() => people.filter((person) => visibleIds.has(person.personId)), [people, visibleIds]);
  const visibleEdges = useMemo(() => edges.filter((edge) => visibleIds.has(edge.a) && visibleIds.has(edge.b)), [edges, visibleIds]);
  const visibleStructuralEdges = useMemo(() => structuralEdges.filter((edge) => visibleIds.has(edge.a) && visibleIds.has(edge.b)), [structuralEdges, visibleIds]);
  const explicitRelationshipEdges = useMemo(() => visibleEdges.filter((edge) => edge.source === "relationship"), [visibleEdges]);
  const layout = useMemo(() => layoutFamilyTree(visibleNodes, visibleStructuralEdges, visibleIds, mainLine), [visibleNodes, visibleStructuralEdges, visibleIds, mainLine]);
  const hiddenCount = Math.max(0, people.length - visibleIds.size);
  const mainPairs = useMemo(() => new Set(mainLine.slice(0, -1).map((id, index) => `${id}:${mainLine[index + 1]}`)), [mainLine]);
  const hoveredNeighbors = useMemo(() => {
    const result = new Set<number>();
    if (hoveredPersonId == null) return result;
    for (const edge of visibleEdges) {
      if (edge.a === hoveredPersonId) result.add(edge.b);
      if (edge.b === hoveredPersonId) result.add(edge.a);
    }
    return result;
  }, [hoveredPersonId, visibleEdges]);

  const relationshipLaneByKey = useMemo(() => {
    const grouped = new Map<string, TreeEdge[]>();
    for (const edge of explicitRelationshipEdges) {
      const pair = pairKeyForEdge(edge);
      grouped.set(pair, [...(grouped.get(pair) ?? []), edge]);
    }
    const result = new Map<string, number>();
    for (const group of grouped.values()) {
      group.forEach((edge, index) => result.set(edgeKey(edge), index - (group.length - 1) / 2));
    }
    return result;
  }, [explicitRelationshipEdges]);

  const scrollToOldest = (behavior: ScrollBehavior = "smooth") => {
    const viewport = viewportRef.current;
    const oldest = mainLine[0] ? layout.positions.get(mainLine[0]) : undefined;
    if (!viewport || !oldest) return;
    viewport.scrollTo({
      left: Math.max(0, (oldest.x + FAMILY_NODE_WIDTH / 2) * zoom - viewport.clientWidth / 2),
      top: Math.max(0, oldest.y * zoom - 72),
      behavior,
    });
  };

  const fitTree = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const availableWidth = Math.max(320, viewport.clientWidth - 40);
    const availableHeight = Math.max(320, viewport.clientHeight - 96);
    const next = clampZoom(Math.min(1, availableWidth / layout.width, availableHeight / layout.height));
    setZoom(next);
    requestAnimationFrame(() => viewport.scrollTo({ left: 0, top: 0, behavior: "smooth" }));
  };

  const toggleFullscreen = async () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    if (document.fullscreenElement === viewport) await document.exitFullscreen();
    else await viewport.requestFullscreen();
  };

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(document.fullscreenElement === viewportRef.current);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const handleWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      setZoom((current) => {
        const next = clampZoom(current + (event.deltaY < 0 ? WHEEL_ZOOM_STEP : -WHEEL_ZOOM_STEP));
        if (next === current) return current;
        const logicalX = (viewport.scrollLeft + pointerX) / current;
        const logicalY = (viewport.scrollTop + pointerY) / current;
        requestAnimationFrame(() => {
          viewport.scrollLeft = Math.max(0, logicalX * next - pointerX);
          viewport.scrollTop = Math.max(0, logicalY * next - pointerY);
        });
        return next;
      });
    };
    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, []);

  useEffect(() => {
    if (centeredInitially.current || !mainLine.length) return;
    centeredInitially.current = true;
    requestAnimationFrame(() => scrollToOldest("auto"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainLine.length]);

  const toggleBranch = (anchor: number) => {
    setShowAll(false);
    setExpandedAnchors((current) => {
      const next = new Set(current);
      if (next.has(anchor)) next.delete(anchor);
      else next.add(anchor);
      return next;
    });
  };

  const beginMainLineEdit = () => {
    setDraftMainLine(storedMainLine.length ? storedMainLine : automaticMainLine);
    setMainLineError(null);
    setShowAll(true);
    setEditingMainLine(true);
  };

  const cancelMainLineEdit = () => {
    setDraftMainLine([]);
    setMainLineError(null);
    setEditingMainLine(false);
    setShowAll(false);
  };

  const changeMainLineStart = (personId: number) => {
    const line = findFamilyDescendantLine(people, structuralEdges, personId);
    setDraftMainLine(line.length ? line : [personId]);
    setMainLineError(null);
  };

  const changeSuccessor = (index: number, childId: number | null) => {
    const prefix = draftMainLine.slice(0, index + 1);
    if (!childId) {
      setDraftMainLine(prefix);
      return;
    }
    const suffix = findFamilyDescendantLine(people, structuralEdges, childId);
    setDraftMainLine([...prefix, ...(suffix.length ? suffix : [childId])]);
    setMainLineError(null);
  };

  const saveMainLine = () => {
    if (!named || typeof treeId !== "number" || !draftMainLine.length) return;
    setMainLineError(null);
    startMainLineTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("personIds", draftMainLine.join(","));
        await updateFamilyTreeMainLineAction(projectId, treeId, formData);
        setPersistedMainLine([...draftMainLine]);
        setEditingMainLine(false);
        setShowAll(false);
      } catch (error) {
        setMainLineError(error instanceof Error ? error.message : "Die Hauptlinie konnte nicht gespeichert werden.");
      }
    });
  };

  const resetAutomaticMainLine = () => {
    if (!named || typeof treeId !== "number") return;
    setMainLineError(null);
    startMainLineTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("personIds", "");
        await updateFamilyTreeMainLineAction(projectId, treeId, formData);
        setPersistedMainLine(null);
        setDraftMainLine(automaticMainLine);
        setEditingMainLine(false);
        setShowAll(false);
      } catch (error) {
        setMainLineError(error instanceof Error ? error.message : "Die automatische Hauptlinie konnte nicht wiederhergestellt werden.");
      }
    });
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || isInteractiveTarget(event.target)) return;
    const viewport = viewportRef.current;if(!viewport)return;
    panState.current={pointerId:event.pointerId,x:event.clientX,y:event.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};
    viewport.setPointerCapture(event.pointerId);viewport.dataset.panning="true";
  };
  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state=panState.current;const viewport=viewportRef.current;if(!state||!viewport||state.pointerId!==event.pointerId)return;
    viewport.scrollLeft=state.left-(event.clientX-state.x);viewport.scrollTop=state.top-(event.clientY-state.y);
  };
  const stopPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const viewport=viewportRef.current;if(panState.current?.pointerId!==event.pointerId||!viewport)return;
    panState.current=null;delete viewport.dataset.panning;if(viewport.hasPointerCapture(event.pointerId))viewport.releasePointerCapture(event.pointerId);
  };
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if(isInteractiveTarget(event.target))return;
    if(event.key==="+"||event.key==="="){event.preventDefault();setZoom((current)=>clampZoom(current+ZOOM_STEP));}
    else if(event.key==="-"){event.preventDefault();setZoom((current)=>clampZoom(current-ZOOM_STEP));}
    else if(event.key==="0"){event.preventDefault();setZoom(1);}
    else if(event.key.toLowerCase()==="f"){event.preventDefault();fitTree();}
  };
  const handleNodeBlur=(event:ReactFocusEvent<HTMLElement>)=>{
    if(!event.currentTarget.contains(event.relatedTarget as Node|null))setHoveredPersonId(null);
  };

  const geometry = useMemo(() => {
    const parentGroups = new Map<number, TreeEdge[]>();
    for (const edge of visibleStructuralEdges) if (isFamilyParentEdge(edge)) parentGroups.set(edge.b, [...(parentGroups.get(edge.b) ?? []), edge]);
    const rawFamilyUnits = new Map<string, { generation: number; parentIds: number[]; childIds: number[]; childEdges: Map<number, TreeEdge[]> }>();
    for (const [childId, childParentEdges] of parentGroups) {
      const childPos = layout.positions.get(childId);if (!childPos) continue;
      const parentIds = [...new Set(childParentEdges.map((edge) => edge.a))].sort((a, b) => a - b);
      if (!parentIds.length || parentIds.some((id) => !layout.positions.has(id))) continue;
      const key = `${childPos.generation}|${parentIds.join(",")}`;
      const existing = rawFamilyUnits.get(key) ?? { generation: childPos.generation, parentIds, childIds: [], childEdges: new Map<number, TreeEdge[]>() };
      existing.childIds.push(childId);existing.childEdges.set(childId, childParentEdges);rawFamilyUnits.set(key, existing);
    }
    const familyUnits: ResolvedFamilyUnit[] = [...rawFamilyUnits.entries()].map(([key, unit]) => {
      const parents = unit.parentIds.map((id) => ({ id, pos: layout.positions.get(id) })).filter((item): item is { id: number; pos: FamilyTreePosition } => Boolean(item.pos));
      const children = [...new Set(unit.childIds)].map((id) => ({ id, pos: layout.positions.get(id), edges: unit.childEdges.get(id) ?? [] })).filter((item): item is { id: number; pos: FamilyTreePosition; edges: TreeEdge[] } => Boolean(item.pos)).sort((a, b) => a.pos.x - b.pos.x || a.id - b.id);
      const centers = [...parents.map(({ pos }) => pos.x + FAMILY_NODE_WIDTH / 2), ...children.map(({ pos }) => pos.x + FAMILY_NODE_WIDTH / 2)];
      return {key,routeId:Math.min(...children.map((child) => child.id)),generation:unit.generation,parentIds:unit.parentIds,parents,children,startX:Math.min(...centers),endX:Math.max(...centers)};
    }).filter((unit) => unit.parents.length > 0 && unit.children.length > 0);
    const routeLanes = assignFamilyParentRouteLanes(familyUnits.map<FamilyParentRoute>((unit) => ({childId:unit.routeId,generation:unit.generation,startX:unit.startX,endX:unit.endX})));
    return {familyUnits,routeLanes};
  }, [layout, visibleStructuralEdges]);

  const familySvg = useMemo(() => geometry.familyUnits.map((unit) => {
    const laneIndex = geometry.routeLanes.get(unit.routeId) ?? 0;
    const parentXs = unit.parents.map(({ pos }) => pos.x + FAMILY_NODE_WIDTH / 2);const childXs = unit.children.map(({ pos }) => pos.x + FAMILY_NODE_WIDTH / 2);
    const parentBottom = Math.max(...unit.parents.map(({ pos }) => pos.y + FAMILY_NODE_HEIGHT));const childTop = Math.min(...unit.children.map(({ pos }) => pos.y));const gap = Math.max(80, childTop - parentBottom);
    let parentJoinY = parentBottom + Math.max(28, Math.min(52, gap * .3)) + laneIndex * 12;let childBusY = childTop - Math.max(34, Math.min(56, gap * .3)) - laneIndex * 10;
    if (childBusY - parentJoinY < 26) {const middle = (parentBottom + childTop) / 2;parentJoinY = middle - 13;childBusY = middle + 13;}
    const parentMinX = Math.min(...parentXs);const parentMaxX = Math.max(...parentXs);const hubX = unit.parents.length > 1 ? (parentMinX + parentMaxX) / 2 : parentXs[0];const childBusMinX = Math.min(hubX, ...childXs);const childBusMaxX = Math.max(hubX, ...childXs);const unitHasMain = unit.children.some((child) => child.edges.some((edge) => mainPairs.has(`${edge.a}:${edge.b}`)));
    const hoverMatch=hoveredPersonId!=null&&(unit.parentIds.includes(hoveredPersonId)||unit.children.some((child)=>child.id===hoveredPersonId));
    const hoverClass=hoveredPersonId==null?"":hoverMatch?styles.edgeHighlighted:styles.edgeDimmed;
    return <g key={`family-unit-${unit.key}`} className={hoverClass}>
      {unit.parents.length > 1 ? <path d={`M ${parentMinX} ${parentJoinY} H ${parentMaxX}`} className={styles.parentJunction} /> : null}
      {unit.parents.map(({ id, pos }) => {const parentX=pos.x+FAMILY_NODE_WIDTH/2;const parentIsMain=unit.children.some((child)=>child.edges.some((edge)=>edge.a===id&&mainPairs.has(`${edge.a}:${edge.b}`)));return <path key={`family-parent-${unit.key}-${id}`} d={`M ${parentX} ${pos.y + FAMILY_NODE_HEIGHT} V ${parentJoinY}`} className={parentIsMain ? styles.mainParentEdge : styles.parentEdge} />;})}
      <circle cx={hubX} cy={parentJoinY} r="3.5" className={unitHasMain ? styles.mainJunctionDot : styles.junctionDot}/><path d={`M ${hubX} ${parentJoinY} V ${childBusY}`} className={unitHasMain ? styles.mainParentEdge : styles.parentEdge}/>{childBusMaxX-childBusMinX>1?<path d={`M ${childBusMinX} ${childBusY} H ${childBusMaxX}`} className={styles.parentJunction}/>:null}<circle cx={hubX} cy={childBusY} r="3" className={unitHasMain ? styles.mainJunctionDot : styles.junctionDot}/>
      {unit.children.map((child)=>{const childX=child.pos.x+FAMILY_NODE_WIDTH/2;const childIsMain=child.edges.some((edge)=>mainPairs.has(`${edge.a}:${edge.b}`));return <g key={`family-child-${unit.key}-${child.id}`}><path d={`M ${childX} ${childBusY} V ${child.pos.y}`} className={childIsMain?styles.mainParentEdge:styles.parentEdge}/><circle cx={childX} cy={childBusY} r="2.7" className={childIsMain?styles.mainJunctionDot:styles.junctionDot}/></g>;})}
    </g>;
  }), [geometry.familyUnits, geometry.routeLanes, hoveredPersonId, mainPairs]);

  const explicitRelationshipSvg = useMemo(() => explicitRelationshipEdges.map((edge) => {
    const a=layout.positions.get(edge.a);const b=layout.positions.get(edge.b);if(!a||!b)return null;
    const lane=(relationshipLaneByKey.get(edgeKey(edge))??0)*22;
    const ax=a.x+FAMILY_NODE_WIDTH/2;const ay=a.y+FAMILY_NODE_HEIGHT/2;const bx=b.x+FAMILY_NODE_WIDTH/2;const by=b.y+FAMILY_NODE_HEIGHT/2;
    const dx=bx-ax;const dy=by-ay;
    let path:string;let labelX:number;let labelY:number;
    if(Math.abs(dy)>Math.abs(dx)*0.45){
      const down=dy>=0;const startY=down?a.y+FAMILY_NODE_HEIGHT:a.y;const endY=down?b.y:b.y+FAMILY_NODE_HEIGHT;const midY=(startY+endY)/2;
      path=`M ${ax} ${startY} C ${ax+lane} ${midY}, ${bx+lane} ${midY}, ${bx} ${endY}`;
      labelX=(ax+bx)/2+lane;labelY=midY-8;
    }else{
      const right=dx>=0;const startX=right?a.x+FAMILY_NODE_WIDTH:a.x;const endX=right?b.x:b.x+FAMILY_NODE_WIDTH;const midX=(startX+endX)/2;
      path=`M ${startX} ${ay} C ${midX} ${ay+lane}, ${midX} ${by+lane}, ${endX} ${by}`;
      labelX=midX;labelY=(ay+by)/2+lane-8;
    }
    const hoverMatch=hoveredPersonId!=null&&(edge.a===hoveredPersonId||edge.b===hoveredPersonId);const hoverClass=hoveredPersonId==null?"":hoverMatch?styles.edgeHighlighted:styles.edgeDimmed;
    const edgeClass=edge.category==="family"?styles.explicitFamilyEdge:styles.explicitRelationshipEdge;
    return <g key={edgeKey(edge)} className={hoverClass}><path d={path} className={edgeClass}/><text x={labelX} y={labelY} textAnchor="middle" className={styles.edgeLabel}>{edge.label}</text></g>;
  }), [explicitRelationshipEdges, hoveredPersonId, layout, relationshipLaneByKey]);

  const disconnectedHidden = people.length - new Set([...mainLineSet, ...[...branchNodes.values()].flatMap((set) => [...set])]).size;
  const startOptions = useMemo(() => [...people].sort((a, b) => (baseGenerations.get(a.personId) ?? 0) - (baseGenerations.get(b.personId) ?? 0) || a.name.localeCompare(b.name) || a.personId - b.personId), [baseGenerations, people]);

  return (
    <div className={styles.canvasShell} ref={viewportRef} tabIndex={0} aria-label="Interaktiver Stammbaum. Mausrad zoomt, Ziehen verschiebt, Plus/Minus zoomt, 0 setzt 100 Prozent und F passt den Baum ein. Beim Überfahren einer Person werden direkte Beziehungen hervorgehoben." onKeyDown={handleKeyDown} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={stopPan} onPointerCancel={stopPan}>
      <div className={styles.canvasControls}>
        <div className={styles.canvasStatus}><strong>Hauptlinie</strong><span>{mainLine.length} Personen</span><span>{explicitRelationshipEdges.length} gespeicherte Beziehungen sichtbar</span><span>{persistedMainLine?.length ? "manuell" : "automatisch"}</span><span>{hiddenCount ? `${hiddenCount} ausgeblendet` : "alle sichtbar"}</span>{hoveredPersonId!=null?<span>{hoveredNeighbors.size} direkte Verbindung{hoveredNeighbors.size===1?"":"en"}</span>:null}</div>
        <div className={styles.canvasButtons}>
          {!editingMainLine ? <button type="button" className="button ghost" onClick={() => { setShowAll(false); setExpandedAnchors(new Set()); }}>Nur Hauptlinie</button> : null}
          {!editingMainLine ? <button type="button" className="button ghost" onClick={() => setShowAll(true)} disabled={showAll || people.length === visibleIds.size}>Alle Zweige</button> : null}
          {named && !editingMainLine ? <button type="button" className="button ghost" onClick={beginMainLineEdit}>✎ Hauptlinie bearbeiten</button> : null}
          <span className={styles.zoomControls}><button type="button" aria-label="Herauszoomen" onClick={() => setZoom((current) => clampZoom(current - ZOOM_STEP))} disabled={zoom <= MIN_ZOOM}>−</button><button type="button" className={styles.zoomValue} onClick={() => setZoom(1)} title="Zoom auf 100 % zurücksetzen">{Math.round(zoom * 100)}%</button><button type="button" aria-label="Hineinzoomen" onClick={() => setZoom((current) => clampZoom(current + ZOOM_STEP))} disabled={zoom >= MAX_ZOOM}>+</button><button type="button" onClick={fitTree}>Einpassen</button></span>
          <button type="button" className="button ghost" onClick={() => scrollToOldest()}>↑ Älteste Generation</button>
          <button type="button" className="button ghost" onClick={toggleFullscreen} aria-pressed={isFullscreen}>{isFullscreen?"Vollbild schließen":"⛶ Vollbild"}</button>
        </div>
      </div>

      {editingMainLine ? <section className={styles.mainLineEditor}><div className={styles.mainLineEditorHead}><div><strong>Hauptlinie bearbeiten</strong><p>Wähle die Startperson und danach pro Generation den tatsächlichen Nachfolger. Nur direkte Eltern-Kind-Schritte können gespeichert werden.</p></div><button type="button" className="button ghost" onClick={cancelMainLineEdit} disabled={savingMainLine}>Schließen</button></div><label className={styles.mainLineStart}>Start der Hauptlinie<select value={draftMainLine[0] ?? ""} onChange={(event) => changeMainLineStart(Number(event.target.value))}>{startOptions.map((person) => <option key={person.personId} value={person.personId}>Generation {(baseGenerations.get(person.personId) ?? 0) + 1} · {person.name}</option>)}</select></label><div className={styles.mainLineChain}>{draftMainLine.map((personId,index)=>{const person=personById.get(personId);if(!person)return null;const childIds=childrenByParent.get(personId)??[];const currentNext=draftMainLine[index+1];return <div key={`${personId}-${index}`} className={styles.mainLineStep}><span>Gen. {(baseGenerations.get(personId)??0)+1}</span><strong>{person.name}</strong>{childIds.length?<label>Nachfolger<select value={currentNext&&childIds.includes(currentNext)?currentNext:""} onChange={(event)=>changeSuccessor(index,event.target.value?Number(event.target.value):null)}><option value="">Linie hier beenden</option>{childIds.map((childId)=><option key={childId} value={childId}>{personById.get(childId)?.name??`Person #${childId}`}</option>)}</select></label>:<small>Keine direkten Kinder in diesem Stammbaum</small>}</div>;})}</div>{mainLineError?<div className={styles.mainLineError}>{mainLineError}</div>:null}<div className={styles.mainLineEditorActions}><button type="button" className="primary" onClick={saveMainLine} disabled={savingMainLine||!draftMainLine.length}>{savingMainLine?"Speichere …":"Hauptlinie speichern"}</button><button type="button" className="button ghost" onClick={resetAutomaticMainLine} disabled={savingMainLine}>Automatische Linie verwenden</button><button type="button" className="button ghost" onClick={cancelMainLineEdit} disabled={savingMainLine}>Abbrechen</button></div></section> : null}

      <div className={styles.zoomSurface} style={{ width: layout.width * zoom, height: layout.height * zoom }}><div className={styles.canvas} style={{ width: layout.width, height: layout.height, transform: `scale(${zoom})` }}>
        {layout.shownGenerations.map((generation)=>{const first=visibleNodes.find((node)=>layout.positions.get(node.personId)?.generation===generation);const position=first?layout.positions.get(first.personId):null;if(!position)return null;return <div key={generation} className={styles.generationMarker} style={{top:position.y-38}}>{generation===0?"Älteste Generation":`Generation ${generation+1}`}</div>;})}
        <svg className={styles.edges} width={layout.width} height={layout.height} aria-hidden="true">{familySvg}{explicitRelationshipSvg}</svg>
        {visibleNodes.map((node)=>{const pos=layout.positions.get(node.personId);if(!pos)return null;const main=mainLineSet.has(node.personId);const root=node.personId===rootPersonId;const branchCount=branchNodes.get(node.personId)?.size??0;const branchOpen=expandedAnchors.has(node.personId);const removable=named&&typeof treeId==="number"&&!root&&!editingMainLine;const removeAction=removable?removeFamilyTreeMemberAction.bind(null,projectId,treeId,node.personId):null;const hoverActive=hoveredPersonId!=null;const hoverSelf=hoveredPersonId===node.personId;const hoverConnected=hoveredNeighbors.has(node.personId);const hoverClass=!hoverActive?"":hoverSelf?styles.nodeHovered:hoverConnected?styles.nodeConnected:styles.nodeDimmed;return <article key={node.personId} data-tree-node className={`${styles.node} ${main?styles.mainNode:styles.branchNode} ${root?styles.rootNode:""} ${hoverClass}`} style={{left:pos.x,top:pos.y}} onMouseEnter={()=>setHoveredPersonId(node.personId)} onMouseLeave={()=>setHoveredPersonId(null)} onFocusCapture={()=>setHoveredPersonId(node.personId)} onBlurCapture={handleNodeBlur}><Link href={personHref(projectId,node)} className={styles.nodeLink}><div className={styles.nodeHead}><span className={styles.avatar}>{validImage(node.image)?<img src={node.image} alt="" loading="lazy"/>:node.name.slice(0,1).toUpperCase()}</span><span className={styles.nodeIdentity}><strong>{node.name}</strong><small>{node.kind}{node.title?` · ${node.title}`:""}</small></span></div></Link><div className={styles.nodeBadges}>{main?<span className={styles.mainBadge}>{editingMainLine?"Hauptlinie · Vorschau":"Hauptlinie"}</span>:<span>Seitenzweig</span>}{root?<span>Root</span>:null}{node.roleLabel&&node.roleLabel!=="Root"?<span>{node.roleLabel}</span>:null}{node.branchLabel?<span>{node.branchLabel}</span>:null}</div><div className={styles.nodeActions}>{!editingMainLine&&main&&branchCount>0&&!showAll?<button type="button" className={styles.branchToggle} onClick={()=>toggleBranch(node.personId)}>{branchOpen?"− Seitenzweige":`+ ${branchCount} Zweig${branchCount===1?"":"e"}`}</button>:null}{removeAction?<form action={removeAction}><button className={styles.removeButton}>Entfernen</button></form>:null}</div></article>;})}
        {!editingMainLine&&!showAll&&disconnectedHidden>0?<div className={styles.disconnectedHint}>{disconnectedHidden} weitere Person{disconnectedHidden===1?"":"en"} liegen in getrennten Familienlinien. <button type="button" onClick={()=>setShowAll(true)}>Alle anzeigen</button></div>:null}
      </div></div>
    </div>
  );
}
