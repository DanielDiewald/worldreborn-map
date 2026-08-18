export type FamilyLayoutNode = { personId: number; name: string };
export type FamilyLayoutEdge = { a: number; b: number; code: string; directed: boolean };
export type FamilyTreePosition = { x: number; y: number; generation: number };
export type FamilyParentRoute = { childId: number; generation: number; startX: number; endX: number };

export const FAMILY_PARENT_CODES = new Set(["parent", "adoptive_parent", "step_parent", "guardian"]);
export const FAMILY_PARTNER_CODES = new Set(["spouse", "romantic", "ex_partner", "engaged", "widowed_from"]);
const SAME_GENERATION_CODES = new Set([...FAMILY_PARTNER_CODES, "sibling", "twin"]);

export const FAMILY_NODE_WIDTH = 280;
export const FAMILY_NODE_HEIGHT = 138;
export const FAMILY_ROW_GAP = 310;
const SIDE_PADDING = 170;
const TOP_PADDING = 108;
const BASE_COLUMN_GAP = 150;

export function isFamilyParentEdge(edge: FamilyLayoutEdge) {
  return edge.directed && FAMILY_PARENT_CODES.has(edge.code);
}

export function isFamilyPartnerEdge(edge: FamilyLayoutEdge) {
  return !edge.directed && FAMILY_PARTNER_CODES.has(edge.code);
}

class UnionFind {
  private parent = new Map<number, number>();

  constructor(ids: number[]) {
    for (const id of ids) this.parent.set(id, id);
  }

  find(id: number): number {
    const parent = this.parent.get(id) ?? id;
    if (parent === id) return id;
    const root = this.find(parent);
    this.parent.set(id, root);
    return root;
  }

  union(a: number, b: number) {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA === rootB) return;
    this.parent.set(Math.max(rootA, rootB), Math.min(rootA, rootB));
  }
}

function pathWins(candidate: number[], current: number[]) {
  if (candidate.length !== current.length) return candidate.length > current.length;
  return candidate.join(":") < current.join(":");
}

function parentMaps(nodes: FamilyLayoutNode[], edges: FamilyLayoutEdge[]) {
  const ids = new Set(nodes.map((node) => node.personId));
  const parentEdges = edges.filter((edge) => ids.has(edge.a) && ids.has(edge.b) && isFamilyParentEdge(edge));
  const parents = new Map<number, number[]>();
  const children = new Map<number, number[]>();
  for (const edge of parentEdges) {
    parents.set(edge.b, [...(parents.get(edge.b) ?? []), edge.a]);
    children.set(edge.a, [...(children.get(edge.a) ?? []), edge.b]);
  }
  for (const values of [...parents.values(), ...children.values()]) values.sort((a, b) => a - b);
  return { ids, parentEdges, parents, children };
}

export function buildFamilyGenerations(nodes: FamilyLayoutNode[], edges: FamilyLayoutEdge[]) {
  const { ids, parentEdges } = parentMaps(nodes, edges);
  const parentsByChild = new Map<number, number[]>();
  for (const edge of parentEdges) parentsByChild.set(edge.b, [...(parentsByChild.get(edge.b) ?? []), edge.a]);

  const union = new UnionFind([...ids]);
  for (const edge of edges) {
    if (ids.has(edge.a) && ids.has(edge.b) && SAME_GENERATION_CODES.has(edge.code)) union.union(edge.a, edge.b);
  }
  for (const parents of parentsByChild.values()) {
    for (let index = 1; index < parents.length; index += 1) union.union(parents[0], parents[index]);
  }

  const groups = new Set<number>();
  for (const id of ids) groups.add(union.find(id));
  const outgoing = new Map<number, Set<number>>();
  const indegree = new Map<number, number>();
  for (const group of groups) indegree.set(group, 0);

  for (const edge of parentEdges) {
    const from = union.find(edge.a);
    const to = union.find(edge.b);
    if (from === to) continue;
    const targets = outgoing.get(from) ?? new Set<number>();
    if (!targets.has(to)) {
      targets.add(to);
      outgoing.set(from, targets);
      indegree.set(to, (indegree.get(to) ?? 0) + 1);
    }
  }

  const generationByGroup = new Map<number, number>();
  const queue = [...groups].filter((group) => (indegree.get(group) ?? 0) === 0).sort((a, b) => a - b);
  for (const group of queue) generationByGroup.set(group, 0);

  let cursor = 0;
  while (cursor < queue.length) {
    const group = queue[cursor++];
    const nextGeneration = (generationByGroup.get(group) ?? 0) + 1;
    for (const target of [...(outgoing.get(group) ?? [])].sort((a, b) => a - b)) {
      generationByGroup.set(target, Math.max(generationByGroup.get(target) ?? 0, nextGeneration));
      indegree.set(target, (indegree.get(target) ?? 1) - 1);
      if ((indegree.get(target) ?? 0) === 0) queue.push(target);
    }
  }

  // Defensive fallback for malformed legacy cycles: keep the graph renderable instead of exploding the layout.
  for (const group of groups) if (!generationByGroup.has(group)) generationByGroup.set(group, 0);

  const result = new Map<number, number>();
  for (const id of ids) result.set(id, generationByGroup.get(union.find(id)) ?? 0);
  return result;
}

export function findFamilyDescendantLine(nodes: FamilyLayoutNode[], edges: FamilyLayoutEdge[], startPersonId: number) {
  const { ids, children } = parentMaps(nodes, edges);
  if (!ids.has(startPersonId)) return [];
  const memo = new Map<number, number[]>();
  const visit = (id: number, active = new Set<number>()): number[] => {
    const cached = memo.get(id);
    if (cached) return cached;
    if (active.has(id)) return [id];
    const nextActive = new Set(active).add(id);
    let best = [id];
    for (const child of children.get(id) ?? []) {
      const candidate = [id, ...visit(child, nextActive)];
      if (pathWins(candidate, best)) best = candidate;
    }
    memo.set(id, best);
    return best;
  };
  return visit(startPersonId);
}

export function findFamilyMainLine(nodes: FamilyLayoutNode[], edges: FamilyLayoutEdge[], focusPersonId?: number | null) {
  const { ids, parents, children } = parentMaps(nodes, edges);
  const ancestorMemo = new Map<number, number[]>();
  const ancestorPath = (id: number, active = new Set<number>()): number[] => {
    const memo = ancestorMemo.get(id);
    if (memo) return memo;
    if (active.has(id)) return [id];
    const nextActive = new Set(active).add(id);
    let best = [id];
    for (const parent of parents.get(id) ?? []) {
      const candidate = [...ancestorPath(parent, nextActive), id];
      if (pathWins(candidate, best)) best = candidate;
    }
    ancestorMemo.set(id, best);
    return best;
  };

  const descendantMemo = new Map<number, number[]>();
  const descendantPath = (id: number, active = new Set<number>()): number[] => {
    const memo = descendantMemo.get(id);
    if (memo) return memo;
    if (active.has(id)) return [id];
    const nextActive = new Set(active).add(id);
    let best = [id];
    for (const child of children.get(id) ?? []) {
      const candidate = [id, ...descendantPath(child, nextActive)];
      if (pathWins(candidate, best)) best = candidate;
    }
    descendantMemo.set(id, best);
    return best;
  };

  if (focusPersonId && ids.has(focusPersonId)) {
    const above = ancestorPath(focusPersonId);
    const below = descendantPath(focusPersonId);
    return [...above, ...below.slice(1)];
  }

  const roots = nodes.map((node) => node.personId).filter((id) => !(parents.get(id)?.length));
  const candidates = roots.length ? roots : nodes.map((node) => node.personId);
  let best: number[] = [];
  for (const root of candidates) {
    const candidate = descendantPath(root);
    if (best.length === 0 || pathWins(candidate, best)) best = candidate;
  }
  return best;
}

export function resolveFamilyMainLine(
  nodes: FamilyLayoutNode[],
  edges: FamilyLayoutEdge[],
  preferredIds: number[] | null | undefined,
  focusPersonId?: number | null,
) {
  const ids = new Set(nodes.map((node) => node.personId));
  const parentPairs = new Set(edges.filter(isFamilyParentEdge).map((edge) => `${edge.a}:${edge.b}`));
  const preferred = [...new Set(preferredIds ?? [])].filter((id) => ids.has(id));
  if (preferred.length > 0 && preferred.every((id, index) => index === 0 || parentPairs.has(`${preferred[index - 1]}:${id}`))) return preferred;
  return findFamilyMainLine(nodes, edges, focusPersonId);
}

function adjacency(edges: FamilyLayoutEdge[], ids?: Set<number>) {
  const map = new Map<number, Set<number>>();
  for (const edge of edges) {
    if (ids && (!ids.has(edge.a) || !ids.has(edge.b))) continue;
    const a = map.get(edge.a) ?? new Set<number>();
    const b = map.get(edge.b) ?? new Set<number>();
    a.add(edge.b);
    b.add(edge.a);
    map.set(edge.a, a);
    map.set(edge.b, b);
  }
  return map;
}

export function collectFamilyBranchNodes(anchorId: number, mainLine: Set<number>, edges: FamilyLayoutEdge[]) {
  const links = adjacency(edges);
  const result = new Set<number>();
  const queue = [...(links.get(anchorId) ?? [])].filter((id) => !mainLine.has(id));
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const id = queue[cursor];
    if (result.has(id) || mainLine.has(id)) continue;
    result.add(id);
    for (const neighbor of links.get(id) ?? []) {
      if (!mainLine.has(neighbor) && !result.has(neighbor)) queue.push(neighbor);
    }
  }
  return result;
}

function alignShortDisconnectedBranches(
  generation: Map<number, number>,
  visibleIds: Set<number>,
  edges: FamilyLayoutEdge[],
  mainLine: Set<number>,
) {
  const result = new Map(generation);
  const links = adjacency(edges, visibleIds);
  const visited = new Set<number>();
  const mainGenerations = [...mainLine].filter((id) => visibleIds.has(id)).map((id) => generation.get(id) ?? 0);
  const mainBottom = mainGenerations.length ? Math.max(...mainGenerations) : Math.max(0, ...[...visibleIds].map((id) => generation.get(id) ?? 0));

  for (const start of visibleIds) {
    if (visited.has(start)) continue;
    const component: number[] = [];
    const queue = [start];
    visited.add(start);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const id = queue[cursor];
      component.push(id);
      for (const next of links.get(id) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    if (component.some((id) => mainLine.has(id))) continue;
    const componentBottom = Math.max(...component.map((id) => generation.get(id) ?? 0));
    const shift = Math.max(0, mainBottom - componentBottom);
    if (!shift) continue;
    for (const id of component) result.set(id, (generation.get(id) ?? 0) + shift);
  }
  return result;
}

export function assignFamilyParentRouteLanes(routes: FamilyParentRoute[]) {
  const result = new Map<number, number>();
  const byGeneration = new Map<number, FamilyParentRoute[]>();
  for (const route of routes) byGeneration.set(route.generation, [...(byGeneration.get(route.generation) ?? []), route]);

  for (const generationRoutes of byGeneration.values()) {
    const laneEnds: number[] = [];
    for (const route of [...generationRoutes].sort((a, b) => a.startX - b.startX || a.endX - b.endX || a.childId - b.childId)) {
      let lane = laneEnds.findIndex((end) => route.startX > end + 28);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(route.endX);
      } else {
        laneEnds[lane] = route.endX;
      }
      result.set(route.childId, lane);
    }
  }
  return result;
}

export function layoutFamilyTree(
  allNodes: FamilyLayoutNode[],
  edges: FamilyLayoutEdge[],
  visibleIds: Set<number>,
  mainLineIds: number[],
) {
  const baseGeneration = buildFamilyGenerations(allNodes, edges);
  const visibleNodes = allNodes.filter((node) => visibleIds.has(node.personId));
  const visibleSet = new Set(visibleNodes.map((node) => node.personId));
  const mainLine = new Set(mainLineIds);
  const generation = alignShortDisconnectedBranches(baseGeneration, visibleSet, edges, mainLine);
  const nodeById = new Map(visibleNodes.map((node) => [node.personId, node]));
  const rows = new Map<number, FamilyLayoutNode[]>();
  for (const node of visibleNodes) {
    const row = generation.get(node.personId) ?? 0;
    rows.set(row, [...(rows.get(row) ?? []), node]);
  }
  // Relationship passes below decide the visual order. IDs are only a deterministic final fallback;
  // names must never decide which side of the family a branch appears on.
  for (const [row, values] of rows) rows.set(row, values.sort((a, b) => a.personId - b.personId));

  const parentEdges = edges.filter((edge) => visibleSet.has(edge.a) && visibleSet.has(edge.b) && isFamilyParentEdge(edge));
  const parents = new Map<number, number[]>();
  const children = new Map<number, number[]>();
  for (const edge of parentEdges) {
    parents.set(edge.b, [...(parents.get(edge.b) ?? []), edge.a]);
    children.set(edge.a, [...(children.get(edge.a) ?? []), edge.b]);
  }
  const familyNeighbors = adjacency(edges, visibleSet);

  const sortedGenerations = [...rows.keys()].sort((a, b) => a - b);
  const indexMap = () => {
    const result = new Map<number, number>();
    for (const values of rows.values()) values.forEach((node, index) => result.set(node.personId, index));
    return result;
  };
  const score = (ids: Iterable<number> | undefined, indexes: Map<number, number>) => {
    const values = [...(ids ?? [])].map((id) => indexes.get(id)).filter((value): value is number => value !== undefined);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : Number.POSITIVE_INFINITY;
  };
  const compareScore = (left: number, right: number) => {
    const leftFinite = Number.isFinite(left);
    const rightFinite = Number.isFinite(right);
    if (leftFinite && rightFinite) return left - right;
    if (leftFinite) return -1;
    if (rightFinite) return 1;
    return 0;
  };
  const relationshipCompare = (
    a: FamilyLayoutNode,
    b: FamilyLayoutNode,
    indexes: Map<number, number>,
    primary: Map<number, number[]>,
    secondary: Map<number, number[]>,
  ) => {
    return compareScore(score(primary.get(a.personId), indexes), score(primary.get(b.personId), indexes))
      || compareScore(score(secondary.get(a.personId), indexes), score(secondary.get(b.personId), indexes))
      || compareScore(score(familyNeighbors.get(a.personId), indexes), score(familyNeighbors.get(b.personId), indexes))
      || a.personId - b.personId;
  };

  // Repeated barycentric passes propagate the position of descendants upward through a whole side branch.
  // Crucially, the main line is NOT reinserted into the middle of the row here. Its X coordinate is centered
  // later, after genealogical ordering is complete, so a branch stays above the relatives it actually leads to.
  for (let pass = 0; pass < 7; pass += 1) {
    let indexes = indexMap();
    for (const rowId of sortedGenerations) {
      const row = rows.get(rowId) ?? [];
      row.sort((a, b) => relationshipCompare(a, b, indexes, parents, children));
      rows.set(rowId, row);
      indexes = indexMap();
    }
    indexes = indexMap();
    for (const rowId of [...sortedGenerations].reverse()) {
      const row = rows.get(rowId) ?? [];
      row.sort((a, b) => relationshipCompare(a, b, indexes, children, parents));
      rows.set(rowId, row);
      indexes = indexMap();
    }
  }

  const mergePressure = new Map<number, number>();
  for (const childId of visibleSet) {
    const parentIds = (parents.get(childId) ?? []).filter((id) => visibleSet.has(id));
    if (parentIds.length < 2) continue;
    for (const id of [...parentIds, childId]) mergePressure.set(id, (mergePressure.get(id) ?? 0) + parentIds.length - 1);
  }

  const rowWidth = (row: FamilyLayoutNode[]) => {
    if (row.length === 0) return 0;
    let width = row.length * FAMILY_NODE_WIDTH;
    for (let index = 0; index < row.length - 1; index += 1) {
      const pressure = (mergePressure.get(row[index].personId) ?? 0) + (mergePressure.get(row[index + 1].personId) ?? 0);
      width += BASE_COLUMN_GAP + Math.min(150, pressure * 30);
    }
    return width;
  };

  const widths = new Map<number, number>();
  let widest = 0;
  for (const rowId of sortedGenerations) {
    const width = rowWidth(rows.get(rowId) ?? []);
    widths.set(rowId, width);
    widest = Math.max(widest, width);
  }
  const width = Math.max(1500, widest + SIDE_PADDING * 2);
  const positions = new Map<number, FamilyTreePosition>();

  for (const rowId of sortedGenerations) {
    const row = rows.get(rowId) ?? [];
    const currentWidth = widths.get(rowId) ?? 0;
    let x = (width - currentWidth) / 2;
    const rawPositions = new Map<number, number>();
    for (let index = 0; index < row.length; index += 1) {
      const node = row[index];
      rawPositions.set(node.personId, x);
      x += FAMILY_NODE_WIDTH;
      if (index < row.length - 1) {
        const pressure = (mergePressure.get(node.personId) ?? 0) + (mergePressure.get(row[index + 1].personId) ?? 0);
        x += BASE_COLUMN_GAP + Math.min(150, pressure * 30);
      }
    }

    const mainInRow = row.filter((node) => mainLine.has(node.personId));
    let shift = 0;
    if (mainInRow.length) {
      const currentCenter = mainInRow.reduce((sum, node) => sum + (rawPositions.get(node.personId) ?? 0) + FAMILY_NODE_WIDTH / 2, 0) / mainInRow.length;
      shift = width / 2 - currentCenter;
      const rowMin = Math.min(...row.map((node) => rawPositions.get(node.personId) ?? 0));
      const rowMax = Math.max(...row.map((node) => (rawPositions.get(node.personId) ?? 0) + FAMILY_NODE_WIDTH));
      shift = Math.max(SIDE_PADDING - rowMin, Math.min(shift, width - SIDE_PADDING - rowMax));
    }

    for (const node of row) {
      positions.set(node.personId, {
        x: (rawPositions.get(node.personId) ?? 0) + shift,
        y: TOP_PADDING + rowId * FAMILY_ROW_GAP,
        generation: rowId,
      });
    }
  }

  const maxGeneration = sortedGenerations.length ? Math.max(...sortedGenerations) : 0;
  const height = Math.max(720, TOP_PADDING + maxGeneration * FAMILY_ROW_GAP + FAMILY_NODE_HEIGHT + 170);
  return { positions, width, height, generations: generation, shownGenerations: sortedGenerations, nodeById };
}
