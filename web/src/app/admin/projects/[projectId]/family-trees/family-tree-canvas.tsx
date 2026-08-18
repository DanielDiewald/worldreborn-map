"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  FAMILY_NODE_HEIGHT,
  FAMILY_NODE_WIDTH,
  FAMILY_PARTNER_CODES,
  assignFamilyParentRouteLanes,
  buildFamilyGenerations,
  findFamilyDescendantLine,
  isFamilyParentEdge,
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
};

type TreeEdge = {
  a: number;
  b: number;
  code: string;
  label: string;
  inverseLabel: string | null;
  directed: boolean;
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

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 1.25;
const ZOOM_STEP = 0.1;
const SIBLING_CODES = new Set(["sibling", "twin"]);
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

function pairKey(a: number, b: number) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
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
  const [editingMainLine, setEditingMainLine] = useState(false);
  const [persistedMainLine, setPersistedMainLine] = useState<number[] | null>(() => savedMainLinePersonIds.length ? savedMainLinePersonIds : null);
  const [draftMainLine, setDraftMainLine] = useState<number[]>([]);
  const [mainLineError, setMainLineError] = useState<string | null>(null);
  const [savingMainLine, startMainLineTransition] = useTransition();

  const automaticMainLine = useMemo(() => resolveFamilyMainLine(people, edges, null, rootPersonId), [people, edges, rootPersonId]);
  const storedMainLine = useMemo(() => resolveFamilyMainLine(people, edges, persistedMainLine, rootPersonId), [people, edges, persistedMainLine, rootPersonId]);
  const mainLine = editingMainLine && draftMainLine.length ? draftMainLine : storedMainLine;
  const mainLineSet = useMemo(() => new Set(mainLine), [mainLine]);
  const baseGenerations = useMemo(() => buildFamilyGenerations(people, edges), [people, edges]);
  const personById = useMemo(() => new Map(people.map((person) => [person.personId, person])), [people]);
  const childrenByParent = useMemo(() => {
    const result = new Map<number, number[]>();
    for (const edge of edges) {
      if (!isFamilyParentEdge(edge)) continue;
      result.set(edge.a, [...(result.get(edge.a) ?? []), edge.b]);
    }
    for (const [parentId, childIds] of result) {
      result.set(parentId, [...new Set(childIds)].sort((a, b) => (baseGenerations.get(a) ?? 0) - (baseGenerations.get(b) ?? 0) || (personById.get(a)?.name ?? "").localeCompare(personById.get(b)?.name ?? "") || a - b));
    }
    return result;
  }, [baseGenerations, edges, personById]);

  const branchNodes = useMemo(() => collectBranchMap(mainLine, edges), [edges, mainLine]);

  const visibleIds = useMemo(() => {
    if (editingMainLine || showAll) return new Set(people.map((person) => person.personId));
    const result = new Set(mainLine);
    for (const anchor of expandedAnchors) for (const personId of branchNodes.get(anchor) ?? []) result.add(personId);
    return result;
  }, [branchNodes, editingMainLine, expandedAnchors, mainLine, people, showAll]);

  const visibleNodes = useMemo(() => people.filter((person) => visibleIds.has(person.personId)), [people, visibleIds]);
  const visibleEdges = useMemo(() => edges.filter((edge) => visibleIds.has(edge.a) && visibleIds.has(edge.b)), [edges, visibleIds]);
  const layout = useMemo(() => layoutFamilyTree(visibleNodes, visibleEdges, visibleIds, mainLine), [visibleNodes, visibleEdges, visibleIds, mainLine]);
  const hiddenCount = Math.max(0, people.length - visibleIds.size);
  const mainPairs = useMemo(() => new Set(mainLine.slice(0, -1).map((id, index) => `${id}:${mainLine[index + 1]}`)), [mainLine]);

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

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const handleWheel = (event: globalThis.WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setZoom((current) => clampZoom(current + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)));
    };
    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, []);

  useEffect(() => {
    if (centeredInitially.current || !mainLine.length) return;
    centeredInitially.current = true;
    requestAnimationFrame(() => scrollToOldest("auto"));
    // Only center once. Expanding branches or editing the succession must not yank the viewport around.
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
    const line = findFamilyDescendantLine(people, edges, personId);
    setDraftMainLine(line.length ? line : [personId]);
    setMainLineError(null);
  };

  const changeSuccessor = (index: number, childId: number | null) => {
    const prefix = draftMainLine.slice(0, index + 1);
    if (!childId) {
      setDraftMainLine(prefix);
      return;
    }
    const suffix = findFamilyDescendantLine(people, edges, childId);
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

  const geometry = useMemo(() => {
    const parentGroups = new Map<number, TreeEdge[]>();
    for (const edge of visibleEdges) if (isFamilyParentEdge(edge)) parentGroups.set(edge.b, [...(parentGroups.get(edge.b) ?? []), edge]);
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
    const coParentPairs = new Set<string>();const siblingPairsFromParentage = new Set<string>();
    for (const unit of familyUnits) {
      for (let left = 0; left < unit.parentIds.length; left += 1) for (let right = left + 1; right < unit.parentIds.length; right += 1) coParentPairs.add(pairKey(unit.parentIds[left], unit.parentIds[right]));
      for (let left = 0; left < unit.children.length; left += 1) for (let right = left + 1; right < unit.children.length; right += 1) siblingPairsFromParentage.add(pairKey(unit.children[left].id, unit.children[right].id));
    }
    const nonParentEdges = visibleEdges.filter((edge) => !isFamilyParentEdge(edge));
    const partnerEdges = nonParentEdges.filter((edge) => FAMILY_PARTNER_CODES.has(edge.code) && !coParentPairs.has(pairKey(edge.a, edge.b)));
    const siblingEdges = nonParentEdges.filter((edge) => SIBLING_CODES.has(edge.code) && (edge.code === "twin" || !siblingPairsFromParentage.has(pairKey(edge.a, edge.b))));
    const otherKinshipEdges = nonParentEdges.filter((edge) => !FAMILY_PARTNER_CODES.has(edge.code) && !SIBLING_CODES.has(edge.code));
    return {familyUnits,routeLanes,partnerEdges,siblingEdges,otherKinshipEdges};
  }, [layout, visibleEdges]);

  const familySvg = useMemo(() => geometry.familyUnits.map((unit) => {
    const laneIndex = geometry.routeLanes.get(unit.routeId) ?? 0;
    const parentXs = unit.parents.map(({ pos }) => pos.x + FAMILY_NODE_WIDTH / 2);const childXs = unit.children.map(({ pos }) => pos.x + FAMILY_NODE_WIDTH / 2);
    const parentBottom = Math.max(...unit.parents.map(({ pos }) => pos.y + FAMILY_NODE_HEIGHT));const childTop = Math.min(...unit.children.map(({ pos }) => pos.y));const gap = Math.max(80, childTop - parentBottom);
    let parentJoinY = parentBottom + Math.max(28, Math.min(52, gap * .3)) + laneIndex * 12;let childBusY = childTop - Math.max(34, Math.min(56, gap * .3)) - laneIndex * 10;
    if (childBusY - parentJoinY < 26) {const middle = (parentBottom + childTop) / 2;parentJoinY = middle - 13;childBusY = middle + 13;}
    const parentMinX = Math.min(...parentXs);const parentMaxX = Math.max(...parentXs);const hubX = unit.parents.length > 1 ? (parentMinX + parentMaxX) / 2 : parentXs[0];const childBusMinX = Math.min(hubX, ...childXs);const childBusMaxX = Math.max(hubX, ...childXs);const unitHasMain = unit.children.some((child) => child.edges.some((edge) => mainPairs.has(`${edge.a}:${edge.b}`)));
    return <g key={`family-unit-${unit.key}`}>
      {unit.parents.length > 1 ? <path d={`M ${parentMinX} ${parentJoinY} H ${parentMaxX}`} className={styles.parentJunction} /> : null}
      {unit.parents.map(({ id, pos }) => {const parentX=pos.x+FAMILY_NODE_WIDTH/2;const parentIsMain=unit.children.some((child)=>child.edges.some((edge)=>edge.a===id&&mainPairs.has(`${edge.a}:${edge.b}`)));return <path key={`family-parent-${unit.key}-${id}`} d={`M ${parentX} ${pos.y + FAMILY_NODE_HEIGHT} V ${parentJoinY}`} className={parentIsMain ? styles.mainParentEdge : styles.parentEdge} />;})}
      <circle cx={hubX} cy={parentJoinY} r="3.5" className={unitHasMain ? styles.mainJunctionDot : styles.junctionDot}/><path d={`M ${hubX} ${parentJoinY} V ${childBusY}`} className={unitHasMain ? styles.mainParentEdge : styles.parentEdge}/>{childBusMaxX-childBusMinX>1?<path d={`M ${childBusMinX} ${childBusY} H ${childBusMaxX}`} className={styles.parentJunction}/>:null}<circle cx={hubX} cy={childBusY} r="3" className={unitHasMain ? styles.mainJunctionDot : styles.junctionDot}/>
      {unit.children.map((child)=>{const childX=child.pos.x+FAMILY_NODE_WIDTH/2;const childIsMain=child.edges.some((edge)=>mainPairs.has(`${edge.a}:${edge.b}`));const specialEdge=child.edges.find((edge)=>edge.code!=="parent");return <g key={`family-child-${unit.key}-${child.id}`}><path d={`M ${childX} ${childBusY} V ${child.pos.y}`} className={childIsMain?styles.mainParentEdge:styles.parentEdge}/><circle cx={childX} cy={childBusY} r="2.7" className={childIsMain?styles.mainJunctionDot:styles.junctionDot}/>{specialEdge?<text x={childX+8} y={child.pos.y-10} textAnchor="start" className={styles.edgeLabel}>{specialEdge.label}</text>:null}</g>;})}
    </g>;
  }), [geometry.familyUnits, geometry.routeLanes, mainPairs]);

  const partnerSvg = useMemo(() => geometry.partnerEdges.map((edge) => {
    const a=layout.positions.get(edge.a);const b=layout.positions.get(edge.b);if(!a||!b)return null;const left=a.x<=b.x?a:b;const right=a.x<=b.x?b:a;const y1=left.y+FAMILY_NODE_HEIGHT/2;const y2=right.y+FAMILY_NODE_HEIGHT/2;const x1=left.x+FAMILY_NODE_WIDTH;const x2=right.x;const midX=(x1+x2)/2;const path=Math.abs(y1-y2)<2?`M ${x1} ${y1} H ${x2}`:`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;return <g key={edgeKey(edge)}><path d={path} className={styles.partnerEdge}/><text x={midX} y={(y1+y2)/2-8} textAnchor="middle" className={styles.edgeLabel}>{edge.label}</text></g>;
  }), [geometry.partnerEdges, layout]);

  const kinshipSvg = useMemo(() => [...geometry.siblingEdges,...geometry.otherKinshipEdges].map((edge,index)=>{
    const a=layout.positions.get(edge.a);const b=layout.positions.get(edge.b);if(!a||!b)return null;const ax=a.x+FAMILY_NODE_WIDTH/2;const bx=b.x+FAMILY_NODE_WIDTH/2;const laneY=Math.min(a.y,b.y)-20-(index%5)*12;return <g key={edgeKey(edge)}><path d={`M ${ax} ${a.y} V ${laneY} H ${bx} V ${b.y}`} className={styles.otherEdge}/><text x={(ax+bx)/2} y={laneY-7} textAnchor="middle" className={styles.edgeLabel}>{edge.label}</text></g>;
  }), [geometry.otherKinshipEdges, geometry.siblingEdges, layout]);

  const disconnectedHidden = people.length - new Set([...mainLineSet, ...[...branchNodes.values()].flatMap((set) => [...set])]).size;
  const startOptions = useMemo(() => [...people].sort((a, b) => (baseGenerations.get(a.personId) ?? 0) - (baseGenerations.get(b.personId) ?? 0) || a.name.localeCompare(b.name) || a.personId - b.personId), [baseGenerations, people]);

  return (
    <div className={styles.canvasShell} ref={viewportRef} tabIndex={0} aria-label="Interaktiver Stammbaum. Ziehen zum Verschieben, Plus/Minus zum Zoomen, 0 für 100 Prozent, F zum Einpassen." onKeyDown={handleKeyDown} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={stopPan} onPointerCancel={stopPan}>
      <div className={styles.canvasControls}>
        <div className={styles.canvasStatus}><strong>Hauptlinie</strong><span>{mainLine.length} Personen</span><span>{persistedMainLine?.length ? "manuell" : "automatisch"}</span><span>{hiddenCount ? `${hiddenCount} ausgeblendet` : "alle sichtbar"}</span></div>
        <div className={styles.canvasButtons}>
          {!editingMainLine ? <button type="button" className="button ghost" onClick={() => { setShowAll(false); setExpandedAnchors(new Set()); }}>Nur Hauptlinie</button> : null}
          {!editingMainLine ? <button type="button" className="button ghost" onClick={() => setShowAll(true)} disabled={showAll || people.length === visibleIds.size}>Alle Zweige</button> : null}
          {named && !editingMainLine ? <button type="button" className="button ghost" onClick={beginMainLineEdit}>✎ Hauptlinie bearbeiten</button> : null}
          <span className={styles.zoomControls}><button type="button" aria-label="Herauszoomen" onClick={() => setZoom((current) => clampZoom(current - ZOOM_STEP))} disabled={zoom <= MIN_ZOOM}>−</button><button type="button" className={styles.zoomValue} onClick={() => setZoom(1)} title="Zoom auf 100 % zurücksetzen">{Math.round(zoom * 100)}%</button><button type="button" aria-label="Hineinzoomen" onClick={() => setZoom((current) => clampZoom(current + ZOOM_STEP))} disabled={zoom >= MAX_ZOOM}>+</button><button type="button" onClick={fitTree}>Einpassen</button></span>
          <button type="button" className="button ghost" onClick={() => scrollToOldest()}>↑ Älteste Generation</button>
        </div>
      </div>

      {editingMainLine ? <section className={styles.mainLineEditor}><div className={styles.mainLineEditorHead}><div><strong>Hauptlinie bearbeiten</strong><p>Wähle die Startperson und danach pro Generation den tatsächlichen Nachfolger. Nur direkte Eltern-Kind-Schritte können gespeichert werden.</p></div><button type="button" className="button ghost" onClick={cancelMainLineEdit} disabled={savingMainLine}>Schließen</button></div><label className={styles.mainLineStart}>Start der Hauptlinie<select value={draftMainLine[0] ?? ""} onChange={(event) => changeMainLineStart(Number(event.target.value))}>{startOptions.map((person) => <option key={person.personId} value={person.personId}>Generation {(baseGenerations.get(person.personId) ?? 0) + 1} · {person.name}</option>)}</select></label><div className={styles.mainLineChain}>{draftMainLine.map((personId,index)=>{const person=personById.get(personId);if(!person)return null;const childIds=childrenByParent.get(personId)??[];const currentNext=draftMainLine[index+1];return <div key={`${personId}-${index}`} className={styles.mainLineStep}><span>Gen. {(baseGenerations.get(personId)??0)+1}</span><strong>{person.name}</strong>{childIds.length?<label>Nachfolger<select value={currentNext&&childIds.includes(currentNext)?currentNext:""} onChange={(event)=>changeSuccessor(index,event.target.value?Number(event.target.value):null)}><option value="">Linie hier beenden</option>{childIds.map((childId)=><option key={childId} value={childId}>{personById.get(childId)?.name??`Person #${childId}`}</option>)}</select></label>:<small>Keine direkten Kinder in diesem Stammbaum</small>}</div>;})}</div>{mainLineError?<div className={styles.mainLineError}>{mainLineError}</div>:null}<div className={styles.mainLineEditorActions}><button type="button" className="primary" onClick={saveMainLine} disabled={savingMainLine||!draftMainLine.length}>{savingMainLine?"Speichere …":"Hauptlinie speichern"}</button><button type="button" className="button ghost" onClick={resetAutomaticMainLine} disabled={savingMainLine}>Automatische Linie verwenden</button><button type="button" className="button ghost" onClick={cancelMainLineEdit} disabled={savingMainLine}>Abbrechen</button></div></section> : null}

      <div className={styles.zoomSurface} style={{ width: layout.width * zoom, height: layout.height * zoom }}><div className={styles.canvas} style={{ width: layout.width, height: layout.height, transform: `scale(${zoom})` }}>
        {layout.shownGenerations.map((generation)=>{const first=visibleNodes.find((node)=>layout.positions.get(node.personId)?.generation===generation);const position=first?layout.positions.get(first.personId):null;if(!position)return null;return <div key={generation} className={styles.generationMarker} style={{top:position.y-38}}>{generation===0?"Älteste Generation":`Generation ${generation+1}`}</div>;})}
        <svg className={styles.edges} width={layout.width} height={layout.height} aria-hidden="true">{familySvg}{partnerSvg}{kinshipSvg}</svg>
        {visibleNodes.map((node)=>{const pos=layout.positions.get(node.personId);if(!pos)return null;const main=mainLineSet.has(node.personId);const root=node.personId===rootPersonId;const branchCount=branchNodes.get(node.personId)?.size??0;const branchOpen=expandedAnchors.has(node.personId);const removable=named&&typeof treeId==="number"&&!root&&!editingMainLine;const removeAction=removable?removeFamilyTreeMemberAction.bind(null,projectId,treeId,node.personId):null;return <article key={node.personId} data-tree-node className={`${styles.node} ${main?styles.mainNode:styles.branchNode} ${root?styles.rootNode:""}`} style={{left:pos.x,top:pos.y}}><Link href={personHref(projectId,node)} className={styles.nodeLink}><div className={styles.nodeHead}><span className={styles.avatar}>{validImage(node.image)?<img src={node.image} alt="" loading="lazy"/>:node.name.slice(0,1).toUpperCase()}</span><span className={styles.nodeIdentity}><strong>{node.name}</strong><small>{node.kind}{node.title?` · ${node.title}`:""}</small></span></div></Link><div className={styles.nodeBadges}>{main?<span className={styles.mainBadge}>{editingMainLine?"Hauptlinie · Vorschau":"Hauptlinie"}</span>:<span>Seitenzweig</span>}{root?<span>Root</span>:null}{node.roleLabel&&node.roleLabel!=="Root"?<span>{node.roleLabel}</span>:null}{node.branchLabel?<span>{node.branchLabel}</span>:null}</div><div className={styles.nodeActions}>{!editingMainLine&&main&&branchCount>0&&!showAll?<button type="button" className={styles.branchToggle} onClick={()=>toggleBranch(node.personId)}>{branchOpen?"− Seitenzweige":`+ ${branchCount} Zweig${branchCount===1?"":"e"}`}</button>:null}{removeAction?<form action={removeAction}><button className={styles.removeButton}>Entfernen</button></form>:null}</div></article>;})}
        {!editingMainLine&&!showAll&&disconnectedHidden>0?<div className={styles.disconnectedHint}>{disconnectedHidden} weitere Person{disconnectedHidden===1?"":"en"} liegen in getrennten Familienlinien. <button type="button" onClick={()=>setShowAll(true)}>Alle anzeigen</button></div>:null}
      </div></div>
    </div>
  );
}
