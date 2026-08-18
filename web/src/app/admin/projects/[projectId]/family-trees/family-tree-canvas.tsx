"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  FAMILY_NODE_HEIGHT,
  FAMILY_NODE_WIDTH,
  FAMILY_PARTNER_CODES,
  assignFamilyParentRouteLanes,
  buildFamilyGenerations,
  collectFamilyBranchNodes,
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

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 1.25;
const ZOOM_STEP = 0.1;

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

export function FamilyTreeCanvas({ projectId, people, edges, rootPersonId, named, treeId, savedMainLinePersonIds }: Props) {
  const router = useRouter();
  const viewportRef = useRef<HTMLDivElement>(null);
  const centeredInitially = useRef(false);
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

  const branchNodes = useMemo(() => {
    const result = new Map<number, Set<number>>();
    for (const personId of mainLine) result.set(personId, collectFamilyBranchNodes(personId, mainLineSet, edges));
    return result;
  }, [edges, mainLine, mainLineSet]);

  const visibleIds = useMemo(() => {
    if (editingMainLine || showAll) return new Set(people.map((person) => person.personId));
    const result = new Set(mainLine);
    for (const anchor of expandedAnchors) for (const personId of branchNodes.get(anchor) ?? []) result.add(personId);
    return result;
  }, [branchNodes, editingMainLine, expandedAnchors, mainLine, people, showAll]);

  const layout = useMemo(() => layoutFamilyTree(people, edges, visibleIds, mainLine), [people, edges, visibleIds, mainLine]);
  const visibleEdges = useMemo(() => edges.filter((edge) => visibleIds.has(edge.a) && visibleIds.has(edge.b)), [edges, visibleIds]);
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
        router.refresh();
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
        router.refresh();
      } catch (error) {
        setMainLineError(error instanceof Error ? error.message : "Die automatische Hauptlinie konnte nicht wiederhergestellt werden.");
      }
    });
  };

  const parentGroups = new Map<number, TreeEdge[]>();
  const partnerAndOther: TreeEdge[] = [];
  for (const edge of visibleEdges) {
    if (isFamilyParentEdge(edge)) parentGroups.set(edge.b, [...(parentGroups.get(edge.b) ?? []), edge]);
    else partnerAndOther.push(edge);
  }

  const resolvedParentGroups = [...parentGroups.entries()].map(([childId, group]) => {
    const child = layout.positions.get(childId);
    if (!child) return null;
    const resolved = group
      .map((edge) => ({ edge, parent: layout.positions.get(edge.a) }))
      .filter((item): item is { edge: TreeEdge; parent: FamilyTreePosition } => Boolean(item.parent))
      .sort((left, right) => left.parent.x - right.parent.x);
    if (!resolved.length) return null;
    const childX = child.x + FAMILY_NODE_WIDTH / 2;
    const xs = [childX, ...resolved.map(({ parent }) => parent.x + FAMILY_NODE_WIDTH / 2)];
    return { childId, child, resolved, childX, startX: Math.min(...xs), endX: Math.max(...xs) };
  }).filter((group): group is NonNullable<typeof group> => Boolean(group));

  const routeLanes = assignFamilyParentRouteLanes(resolvedParentGroups.map<FamilyParentRoute>((group) => ({
    childId: group.childId,
    generation: group.child.generation,
    startX: group.startX,
    endX: group.endX,
  })));

  const parentSvg = resolvedParentGroups.map(({ childId, child, resolved, childX }) => {
    const childTop = child.y;
    const laneIndex = routeLanes.get(childId) ?? 0;
    const maxParentBottom = Math.max(...resolved.map(({ parent }) => parent.y + FAMILY_NODE_HEIGHT));
    const laneY = Math.max(maxParentBottom + 24, childTop - 48 - laneIndex * 20);

    if (resolved.length === 1) {
      const { edge, parent } = resolved[0];
      const parentX = parent.x + FAMILY_NODE_WIDTH / 2;
      const parentBottom = parent.y + FAMILY_NODE_HEIGHT;
      const main = mainPairs.has(`${edge.a}:${edge.b}`);
      return (
        <g key={`parent-group-${childId}`}>
          <path d={`M ${parentX} ${parentBottom} V ${laneY} H ${childX} V ${childTop}`} className={main ? styles.mainParentEdge : styles.parentEdge} />
          <circle cx={childX} cy={laneY} r="3" className={main ? styles.mainJunctionDot : styles.junctionDot} />
          {edge.code !== "parent" ? <text x={(parentX + childX) / 2} y={laneY - 9} textAnchor="middle" className={styles.edgeLabel}>{edge.label}</text> : null}
        </g>
      );
    }

    const parentXs = resolved.map(({ parent }) => parent.x + FAMILY_NODE_WIDTH / 2);
    const minX = Math.min(...parentXs);
    const maxX = Math.max(...parentXs);
    const hasMain = resolved.some(({ edge }) => mainPairs.has(`${edge.a}:${edge.b}`));
    return (
      <g key={`parent-group-${childId}`}>
        <path d={`M ${minX} ${laneY} H ${maxX}`} className={styles.parentJunction} />
        {resolved.map(({ edge, parent }) => {
          const parentX = parent.x + FAMILY_NODE_WIDTH / 2;
          const parentBottom = parent.y + FAMILY_NODE_HEIGHT;
          const main = mainPairs.has(`${edge.a}:${edge.b}`);
          return (
            <g key={edgeKey(edge)}>
              <path d={`M ${parentX} ${parentBottom} V ${laneY}`} className={main ? styles.mainParentEdge : styles.parentEdge} />
              {edge.code !== "parent" ? <text x={parentX + 8} y={laneY - 9} textAnchor="start" className={styles.edgeLabel}>{edge.label}</text> : null}
            </g>
          );
        })}
        <path d={`M ${childX} ${laneY} V ${childTop}`} className={hasMain ? styles.mainParentEdge : styles.parentEdge} />
        <circle cx={childX} cy={laneY} r="3.5" className={hasMain ? styles.mainJunctionDot : styles.junctionDot} />
      </g>
    );
  });

  const lateralSvg = partnerAndOther.map((edge, index) => {
    const a = layout.positions.get(edge.a);
    const b = layout.positions.get(edge.b);
    if (!a || !b) return null;
    const ax = a.x + FAMILY_NODE_WIDTH / 2;
    const bx = b.x + FAMILY_NODE_WIDTH / 2;
    const aBottom = a.y + FAMILY_NODE_HEIGHT;
    const bBottom = b.y + FAMILY_NODE_HEIGHT;
    const laneY = Math.max(aBottom, bBottom) + 24 + (index % 4) * 12;
    const partner = FAMILY_PARTNER_CODES.has(edge.code);
    return (
      <g key={edgeKey(edge)}>
        <path d={`M ${ax} ${aBottom} V ${laneY} H ${bx} V ${bBottom}`} className={partner ? styles.partnerEdge : styles.otherEdge} />
        <text x={(ax + bx) / 2} y={laneY - 8} textAnchor="middle" className={styles.edgeLabel}>{edge.label}</text>
      </g>
    );
  });

  const visibleNodes = people.filter((person) => visibleIds.has(person.personId));
  const disconnectedHidden = people.length - new Set([...mainLineSet, ...[...branchNodes.values()].flatMap((set) => [...set])]).size;
  const startOptions = [...people].sort((a, b) => (baseGenerations.get(a.personId) ?? 0) - (baseGenerations.get(b.personId) ?? 0) || a.name.localeCompare(b.name) || a.personId - b.personId);

  return (
    <div className={styles.canvasShell} ref={viewportRef}>
      <div className={styles.canvasControls}>
        <div className={styles.canvasStatus}>
          <strong>Hauptlinie</strong>
          <span>{mainLine.length} Personen</span>
          <span>{persistedMainLine?.length ? "manuell" : "automatisch"}</span>
          <span>{hiddenCount ? `${hiddenCount} ausgeblendet` : "alle sichtbar"}</span>
        </div>
        <div className={styles.canvasButtons}>
          {!editingMainLine ? <button type="button" className="button ghost" onClick={() => { setShowAll(false); setExpandedAnchors(new Set()); }}>Nur Hauptlinie</button> : null}
          {!editingMainLine ? <button type="button" className="button ghost" onClick={() => setShowAll(true)} disabled={showAll || people.length === visibleIds.size}>Alle Zweige</button> : null}
          {named && !editingMainLine ? <button type="button" className="button ghost" onClick={beginMainLineEdit}>✎ Hauptlinie bearbeiten</button> : null}
          <span className={styles.zoomControls}>
            <button type="button" aria-label="Herauszoomen" onClick={() => setZoom((current) => clampZoom(current - ZOOM_STEP))} disabled={zoom <= MIN_ZOOM}>−</button>
            <button type="button" className={styles.zoomValue} onClick={() => setZoom(1)} title="Zoom auf 100 % zurücksetzen">{Math.round(zoom * 100)}%</button>
            <button type="button" aria-label="Hineinzoomen" onClick={() => setZoom((current) => clampZoom(current + ZOOM_STEP))} disabled={zoom >= MAX_ZOOM}>+</button>
            <button type="button" onClick={fitTree}>Einpassen</button>
          </span>
          <button type="button" className="button ghost" onClick={() => scrollToOldest()}>↑ Älteste Generation</button>
        </div>
      </div>

      {editingMainLine ? (
        <section className={styles.mainLineEditor}>
          <div className={styles.mainLineEditorHead}>
            <div><strong>Hauptlinie bearbeiten</strong><p>Wähle die Startperson und danach pro Generation den tatsächlichen Nachfolger. Nur direkte Eltern-Kind-Schritte können gespeichert werden.</p></div>
            <button type="button" className="button ghost" onClick={cancelMainLineEdit} disabled={savingMainLine}>Schließen</button>
          </div>
          <label className={styles.mainLineStart}>Start der Hauptlinie
            <select value={draftMainLine[0] ?? ""} onChange={(event) => changeMainLineStart(Number(event.target.value))}>
              {startOptions.map((person) => <option key={person.personId} value={person.personId}>Generation {(baseGenerations.get(person.personId) ?? 0) + 1} · {person.name}</option>)}
            </select>
          </label>
          <div className={styles.mainLineChain}>
            {draftMainLine.map((personId, index) => {
              const person = personById.get(personId);
              if (!person) return null;
              const childIds = childrenByParent.get(personId) ?? [];
              const currentNext = draftMainLine[index + 1];
              return <div key={`${personId}-${index}`} className={styles.mainLineStep}>
                <span>Gen. {(baseGenerations.get(personId) ?? 0) + 1}</span>
                <strong>{person.name}</strong>
                {childIds.length ? <label>Nachfolger
                  <select value={currentNext && childIds.includes(currentNext) ? currentNext : ""} onChange={(event) => changeSuccessor(index, event.target.value ? Number(event.target.value) : null)}>
                    <option value="">Linie hier beenden</option>
                    {childIds.map((childId) => <option key={childId} value={childId}>{personById.get(childId)?.name ?? `Person #${childId}`}</option>)}
                  </select>
                </label> : <small>Keine direkten Kinder in diesem Stammbaum</small>}
              </div>;
            })}
          </div>
          {mainLineError ? <div className={styles.mainLineError}>{mainLineError}</div> : null}
          <div className={styles.mainLineEditorActions}>
            <button type="button" className="primary" onClick={saveMainLine} disabled={savingMainLine || !draftMainLine.length}>{savingMainLine ? "Speichere …" : "Hauptlinie speichern"}</button>
            <button type="button" className="button ghost" onClick={resetAutomaticMainLine} disabled={savingMainLine}>Automatische Linie verwenden</button>
            <button type="button" className="button ghost" onClick={cancelMainLineEdit} disabled={savingMainLine}>Abbrechen</button>
          </div>
        </section>
      ) : null}

      <div className={styles.zoomSurface} style={{ width: layout.width * zoom, height: layout.height * zoom }}>
        <div className={styles.canvas} style={{ width: layout.width, height: layout.height, transform: `scale(${zoom})` }}>
          {layout.shownGenerations.map((generation) => {
            const first = visibleNodes.find((node) => layout.positions.get(node.personId)?.generation === generation);
            const position = first ? layout.positions.get(first.personId) : null;
            if (!position) return null;
            return <div key={generation} className={styles.generationMarker} style={{ top: position.y - 38 }}>{generation === 0 ? "Älteste Generation" : `Generation ${generation + 1}`}</div>;
          })}

          <svg className={styles.edges} width={layout.width} height={layout.height} aria-hidden="true">
            {parentSvg}
            {lateralSvg}
          </svg>

          {visibleNodes.map((node) => {
            const pos = layout.positions.get(node.personId);
            if (!pos) return null;
            const main = mainLineSet.has(node.personId);
            const root = node.personId === rootPersonId;
            const branchCount = branchNodes.get(node.personId)?.size ?? 0;
            const branchOpen = expandedAnchors.has(node.personId);
            const removable = named && typeof treeId === "number" && !root && !editingMainLine;
            const removeAction = removable ? removeFamilyTreeMemberAction.bind(null, projectId, treeId, node.personId) : null;
            return (
              <article
                key={node.personId}
                data-tree-node
                className={`${styles.node} ${main ? styles.mainNode : styles.branchNode} ${root ? styles.rootNode : ""}`}
                style={{ left: pos.x, top: pos.y }}
              >
                <Link href={personHref(projectId, node)} className={styles.nodeLink}>
                  <div className={styles.nodeHead}>
                    <span className={styles.avatar}>{validImage(node.image) ? <img src={node.image} alt="" /> : node.name.slice(0, 1).toUpperCase()}</span>
                    <span className={styles.nodeIdentity}>
                      <strong>{node.name}</strong>
                      <small>{node.kind}{node.title ? ` · ${node.title}` : ""}</small>
                    </span>
                  </div>
                </Link>

                <div className={styles.nodeBadges}>
                  {main ? <span className={styles.mainBadge}>{editingMainLine ? "Hauptlinie · Vorschau" : "Hauptlinie"}</span> : <span>Seitenzweig</span>}
                  {root ? <span>Root</span> : null}
                  {node.roleLabel && node.roleLabel !== "Root" ? <span>{node.roleLabel}</span> : null}
                  {node.branchLabel ? <span>{node.branchLabel}</span> : null}
                </div>

                <div className={styles.nodeActions}>
                  {!editingMainLine && main && branchCount > 0 && !showAll ? (
                    <button type="button" className={styles.branchToggle} onClick={() => toggleBranch(node.personId)}>
                      {branchOpen ? "− Seitenzweige" : `+ ${branchCount} Zweig${branchCount === 1 ? "" : "e"}`}
                    </button>
                  ) : null}
                  {removeAction ? <form action={removeAction}><button className={styles.removeButton}>Entfernen</button></form> : null}
                </div>
              </article>
            );
          })}

          {!editingMainLine && !showAll && disconnectedHidden > 0 ? (
            <div className={styles.disconnectedHint}>
              {disconnectedHidden} weitere Person{disconnectedHidden === 1 ? "" : "en"} liegen in getrennten Familienlinien. <button type="button" onClick={() => setShowAll(true)}>Alle anzeigen</button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
