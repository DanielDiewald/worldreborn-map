"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FAMILY_NODE_HEIGHT,
  FAMILY_NODE_WIDTH,
  FAMILY_PARTNER_CODES,
  collectFamilyBranchNodes,
  findFamilyMainLine,
  isFamilyParentEdge,
  layoutFamilyTree,
  type FamilyTreePosition,
} from "@/lib/family-tree-layout";
import { removeFamilyTreeMemberAction } from "./actions";
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
};

function personHref(projectId: number, node: TreePerson) {
  return node.kind === "God" ? `/admin/projects/${projectId}/gods/${node.personId}` : `/admin/projects/${projectId}/npcs/${node.personId}`;
}

function validImage(value: string) {
  return Boolean(value && value.trim() && value !== "noimage" && value !== "/noimg.jpg");
}

function edgeKey(edge: TreeEdge) {
  return `${edge.code}-${edge.a}-${edge.b}-${edge.source}`;
}

export function FamilyTreeCanvas({ projectId, people, edges, rootPersonId, named, treeId }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const centeredInitially = useRef(false);
  const [expandedAnchors, setExpandedAnchors] = useState<Set<number>>(() => new Set());
  const [showAll, setShowAll] = useState(false);

  const mainLine = useMemo(() => findFamilyMainLine(people, edges, rootPersonId), [people, edges, rootPersonId]);
  const mainLineSet = useMemo(() => new Set(mainLine), [mainLine]);
  const branchNodes = useMemo(() => {
    const result = new Map<number, Set<number>>();
    for (const personId of mainLine) result.set(personId, collectFamilyBranchNodes(personId, mainLineSet, edges));
    return result;
  }, [edges, mainLine, mainLineSet]);

  const visibleIds = useMemo(() => {
    if (showAll) return new Set(people.map((person) => person.personId));
    const result = new Set(mainLine);
    for (const anchor of expandedAnchors) for (const personId of branchNodes.get(anchor) ?? []) result.add(personId);
    return result;
  }, [branchNodes, expandedAnchors, mainLine, people, showAll]);

  const layout = useMemo(() => layoutFamilyTree(people, edges, visibleIds, mainLine), [people, edges, visibleIds, mainLine]);
  const visibleEdges = useMemo(() => edges.filter((edge) => visibleIds.has(edge.a) && visibleIds.has(edge.b)), [edges, visibleIds]);
  const hiddenCount = Math.max(0, people.length - visibleIds.size);
  const mainPairs = useMemo(() => new Set(mainLine.slice(0, -1).map((id, index) => `${id}:${mainLine[index + 1]}`)), [mainLine]);

  const scrollToOldest = (behavior: ScrollBehavior = "smooth") => {
    const viewport = viewportRef.current;
    const oldest = mainLine[0] ? layout.positions.get(mainLine[0]) : undefined;
    if (!viewport || !oldest) return;
    viewport.scrollTo({
      left: Math.max(0, oldest.x + FAMILY_NODE_WIDTH / 2 - viewport.clientWidth / 2),
      top: Math.max(0, oldest.y - 62),
      behavior,
    });
  };

  useEffect(() => {
    if (centeredInitially.current || !mainLine.length) return;
    centeredInitially.current = true;
    requestAnimationFrame(() => scrollToOldest("auto"));
    // Only center once. Expanding branches must not yank the user's viewport around.
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

  const parentGroups = new Map<number, TreeEdge[]>();
  const partnerAndOther: TreeEdge[] = [];
  for (const edge of visibleEdges) {
    if (isFamilyParentEdge(edge)) parentGroups.set(edge.b, [...(parentGroups.get(edge.b) ?? []), edge]);
    else partnerAndOther.push(edge);
  }

  const parentSvg = [...parentGroups.entries()].map(([childId, group]) => {
    const child = layout.positions.get(childId);
    if (!child) return null;
    const childX = child.x + FAMILY_NODE_WIDTH / 2;
    const childTop = child.y;
    const laneY = childTop - 72;
    const resolved = group
      .map((edge) => ({ edge, parent: layout.positions.get(edge.a) }))
      .filter((item): item is { edge: TreeEdge; parent: FamilyTreePosition } => Boolean(item.parent))
      .sort((left, right) => left.parent.x - right.parent.x);
    if (!resolved.length) return null;

    if (resolved.length === 1) {
      const { edge, parent } = resolved[0];
      const parentX = parent.x + FAMILY_NODE_WIDTH / 2;
      const parentBottom = parent.y + FAMILY_NODE_HEIGHT;
      const main = mainPairs.has(`${edge.a}:${edge.b}`);
      return (
        <g key={`parent-group-${childId}`}>
          <path d={`M ${parentX} ${parentBottom} V ${laneY} H ${childX} V ${childTop}`} className={main ? styles.mainParentEdge : styles.parentEdge} />
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
    const laneY = Math.max(aBottom, bBottom) + 26 + (index % 3) * 13;
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

  return (
    <div className={styles.canvasShell} ref={viewportRef}>
      <div className={styles.canvasControls}>
        <div className={styles.canvasStatus}>
          <strong>Hauptlinie</strong>
          <span>{mainLine.length} Personen</span>
          <span>{hiddenCount ? `${hiddenCount} ausgeblendet` : "alle sichtbar"}</span>
        </div>
        <div className={styles.canvasButtons}>
          <button type="button" className="button ghost" onClick={() => { setShowAll(false); setExpandedAnchors(new Set()); }}>Nur Hauptlinie</button>
          <button type="button" className="button ghost" onClick={() => setShowAll(true)} disabled={showAll || people.length === visibleIds.size}>Alle Zweige</button>
          <button type="button" className="button ghost" onClick={() => scrollToOldest()}>↑ Älteste Generation</button>
        </div>
      </div>

      <div className={styles.canvas} style={{ width: layout.width, height: layout.height }}>
        {layout.shownGenerations.map((generation, index) => {
          const first = visibleNodes.find((node) => layout.positions.get(node.personId)?.generation === generation);
          const position = first ? layout.positions.get(first.personId) : null;
          if (!position) return null;
          return <div key={generation} className={styles.generationMarker} style={{ top: position.y - 34 }}>{index === 0 ? "Älteste Generation" : `Generation ${index + 1}`}</div>;
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
          const removable = named && typeof treeId === "number" && !root;
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
                {main ? <span className={styles.mainBadge}>Hauptlinie</span> : <span>Seitenzweig</span>}
                {root ? <span>Root</span> : null}
                {node.roleLabel && node.roleLabel !== "Root" ? <span>{node.roleLabel}</span> : null}
                {node.branchLabel ? <span>{node.branchLabel}</span> : null}
              </div>

              <div className={styles.nodeActions}>
                {main && branchCount > 0 && !showAll ? (
                  <button type="button" className={styles.branchToggle} onClick={() => toggleBranch(node.personId)}>
                    {branchOpen ? "− Seitenzweige" : `+ ${branchCount} Zweig${branchCount === 1 ? "" : "e"}`}
                  </button>
                ) : null}
                {removeAction ? <form action={removeAction}><button className={styles.removeButton}>Entfernen</button></form> : null}
              </div>
            </article>
          );
        })}

        {!showAll && disconnectedHidden > 0 ? (
          <div className={styles.disconnectedHint}>
            {disconnectedHidden} weitere Person{disconnectedHidden === 1 ? "" : "en"} liegen in getrennten Familienlinien. <button type="button" onClick={() => setShowAll(true)}>Alle anzeigen</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
