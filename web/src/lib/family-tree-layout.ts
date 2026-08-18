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
const BASE_COLUMN_GAP = 190;

type BranchSide = -1 | 1;

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

function sameGenerationUnion(ids: Set<number>, edges: FamilyLayoutEdge[], parentEdges: FamilyLayoutEdge[]) {
  const union = new UnionFind([...ids]);
  for (const edge of edges) {
    if (ids.has(edge.a) && ids.has(edge.b) && SAME_GENERATION_CODES.has(edge.code)) union.union(edge.a, edge.b);
  }

  const parentsByChild = new Map<number, number[]>();
  for (const edge of parentEdges) parentsByChild.set(edge.b, [...(parentsByChild.get(edge.b) ?? []), edge.a]);
  for (const parentIds of parentsByChild.values()) {
    for (let index = 1; index < parentIds.length; index += 1) union.union(parentIds[0], parentIds[index]);
  }
  return union;
}

export function buildFamilyGenerations(nodes: FamilyLayoutNode[], edges: FamilyLayoutEdge[]) {
  const { ids, parentEdges } = parentMaps(nodes, edges);
  const union = sameGenerationUnion(ids, edges, parentEdges);
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
    const cached = ancestorMemo.get(id);
    if (cached) return cached;
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
    const cached = descendantMemo.get(id);
    if (cached) return cached;
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
  const mainBottom = mainGenerations.length
    ? Math.max(...mainGenerations)
    : Math.max(0, ...[...visibleIds].map((id) => generation.get(id) ?? 0));

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

function compactSideAncestorsTowardAttachments(
  generation: Map<number, number>,
  visibleIds: Set<number>,
  edges: FamilyLayoutEdge[],
  mainLine: Set<number>,
) {
  const result = new Map(generation);
  const parentEdges = edges.filter((edge) => visibleIds.has(edge.a) && visibleIds.has(edge.b) && isFamilyParentEdge(edge));

  // Same-generation links may keep a side family together, but a lateral link to the selected main line must not
  // freeze that side ancestry at an early generation. Parent→child depth is the stronger genealogical constraint.
  const union = new UnionFind([...visibleIds]);
  for (const edge of edges) {
    if (!visibleIds.has(edge.a) || !visibleIds.has(edge.b) || !SAME_GENERATION_CODES.has(edge.code)) continue;
    const aOnMain = mainLine.has(edge.a);
    const bOnMain = mainLine.has(edge.b);
    if (aOnMain !== bOnMain) continue;
    union.union(edge.a, edge.b);
  }

  const members = new Map<number, number[]>();
  for (const id of visibleIds) {
    const root = union.find(id);
    members.set(root, [...(members.get(root) ?? []), id]);
  }

  const outgoing = new Map<number, Set<number>>();
  for (const edge of parentEdges) {
    const from = union.find(edge.a);
    const to = union.find(edge.b);
    if (from === to) continue;
    const targets = outgoing.get(from) ?? new Set<number>();
    targets.add(to);
    outgoing.set(from, targets);
  }

  const fixed = new Set<number>();
  for (const id of mainLine) if (visibleIds.has(id)) fixed.add(union.find(id));
  const groupGeneration = (root: number) => Math.max(...(members.get(root) ?? []).map((id) => result.get(id) ?? 0));
  const roots = [...members.keys()];

  // ALAP (as-late-as-possible) placement: every movable side generation is pulled down to one row before its
  // earliest child. Repeating the pass propagates a late main-line attachment upward through the complete side chain.
  for (let pass = 0; pass < roots.length; pass += 1) {
    let changed = false;
    const ordered = [...roots].sort((a, b) => groupGeneration(b) - groupGeneration(a) || a - b);
    for (const root of ordered) {
      if (fixed.has(root)) continue;
      const childRoots = [...(outgoing.get(root) ?? [])];
      if (!childRoots.length) continue;
      const latestLegal = Math.min(...childRoots.map((childRoot) => groupGeneration(childRoot) - 1));
      const current = groupGeneration(root);
      if (latestLegal <= current) continue;
      for (const id of members.get(root) ?? []) result.set(id, latestLegal);
      changed = true;
    }
    if (!changed) break;
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

function stabilizeBranchSides(
  rows: Map<number, FamilyLayoutNode[]>,
  generation: Map<number, number>,
  visibleSet: Set<number>,
  mainLine: Set<number>,
  familyNeighbors: Map<number, Set<number>>,
  parentEdges: FamilyLayoutEdge[],
) {
  const sideByNode = new Map<number, BranchSide>();
  const offMain = [...visibleSet].filter((id) => !mainLine.has(id));
  const offMainSet = new Set(offMain);
  const branchUnion = new UnionFind(offMain);

  for (const id of offMain) {
    for (const next of familyNeighbors.get(id) ?? []) if (offMainSet.has(next)) branchUnion.union(id, next);
  }

  // A selected main-line person can be the bridge inside one side lineage. Cross that one node, but never walk
  // along the main spine itself, otherwise unrelated side families would collapse into one component.
  const incomingByMain = new Map<number, number[]>();
  const outgoingByMain = new Map<number, number[]>();
  for (const edge of parentEdges) {
    if (mainLine.has(edge.b) && offMainSet.has(edge.a)) incomingByMain.set(edge.b, [...(incomingByMain.get(edge.b) ?? []), edge.a]);
    if (mainLine.has(edge.a) && offMainSet.has(edge.b)) outgoingByMain.set(edge.a, [...(outgoingByMain.get(edge.a) ?? []), edge.b]);
  }
  for (const mainId of mainLine) {
    const incoming = incomingByMain.get(mainId) ?? [];
    const outgoing = outgoingByMain.get(mainId) ?? [];
    if (!incoming.length || !outgoing.length) continue;
    for (const parentId of incoming) for (const childId of outgoing) branchUnion.union(parentId, childId);
  }

  const components = new Map<number, number[]>();
  for (const id of offMain) {
    const root = branchUnion.find(id);
    components.set(root, [...(components.get(root) ?? []), id]);
  }

  for (const component of components.values()) {
    let vote = 0;
    for (const id of component) {
      const rowId = generation.get(id) ?? 0;
      const row = rows.get(rowId) ?? [];
      const nodeIndex = row.findIndex((node) => node.personId === id);
      const mainIndexes = row.map((node, index) => mainLine.has(node.personId) ? index : -1).filter((index) => index >= 0);
      if (nodeIndex < 0 || !mainIndexes.length) continue;
      const mainIndex = mainIndexes.reduce((sum, index) => sum + index, 0) / mainIndexes.length;
      const direction: BranchSide | 0 = nodeIndex < mainIndex ? -1 : nodeIndex > mainIndex ? 1 : 0;
      if (!direction) continue;
      const touchesMain = [...(familyNeighbors.get(id) ?? [])].some((neighbor) => mainLine.has(neighbor));
      const depthWeight = Math.max(1, rowId + 1);
      vote += direction * depthWeight * (touchesMain ? 12 : 1);
    }
    const fallbackId = Math.min(...component);
    const side: BranchSide = vote < 0 ? -1 : vote > 0 ? 1 : fallbackId % 2 === 0 ? -1 : 1;
    for (const id of component) sideByNode.set(id, side);
  }

  for (const [rowId, row] of rows) {
    const mainNodes = row.filter((node) => mainLine.has(node.personId));
    const left = row.filter((node) => !mainLine.has(node.personId) && sideByNode.get(node.personId) === -1);
    const right = row.filter((node) => !mainLine.has(node.personId) && sideByNode.get(node.personId) === 1);
    const neutral = row.filter((node) => !mainLine.has(node.personId) && !sideByNode.has(node.personId));
    rows.set(rowId, mainNodes.length ? [...left, ...neutral, ...mainNodes, ...right] : [...left, ...neutral, ...right]);
  }
  return sideByNode;
}

function anchorFamilyPositions(
  positions: Map<number, FamilyTreePosition>,
  rows: Map<number, FamilyLayoutNode[]>,
  sortedGenerations: number[],
  visibleSet: Set<number>,
  mainLine: Set<number>,
  branchSides: Map<number, BranchSide>,
  children: Map<number, number[]>,
  width: number,
) {
  const centerById = new Map<number, number>();
  for (const [id, position] of positions) centerById.set(id, position.x + FAMILY_NODE_WIDTH / 2);
  const mainCenter = width / 2;
  const minCenterGap = FAMILY_NODE_WIDTH + BASE_COLUMN_GAP;
  const minCenter = SIDE_PADDING + FAMILY_NODE_WIDTH / 2;
  const maxCenter = width - SIDE_PADDING - FAMILY_NODE_WIDTH / 2;
  const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

  const packRow = (row: FamilyLayoutNode[]) => {
    if (!row.length) return;
    const mainNodes = row.filter((node) => mainLine.has(node.personId));
    const offMain = row.filter((node) => !mainLine.has(node.personId));

    if (mainNodes.length) {
      const left: FamilyLayoutNode[] = [];
      const right: FamilyLayoutNode[] = [];
      for (const node of offMain) {
        const desired = centerById.get(node.personId) ?? mainCenter;
        const side: BranchSide = desired < mainCenter ? -1 : desired > mainCenter ? 1 : branchSides.get(node.personId) ?? 1;
        (side === -1 ? left : right).push(node);
      }
      left.sort((a, b) => (centerById.get(a.personId) ?? 0) - (centerById.get(b.personId) ?? 0) || a.personId - b.personId);
      right.sort((a, b) => (centerById.get(a.personId) ?? 0) - (centerById.get(b.personId) ?? 0) || a.personId - b.personId);

      let nearestLeft = mainCenter - minCenterGap;
      for (let index = left.length - 1; index >= 0; index -= 1) {
        const node = left[index];
        const desired = Math.min(centerById.get(node.personId) ?? nearestLeft, nearestLeft);
        const center = Math.max(minCenter, desired);
        centerById.set(node.personId, center);
        nearestLeft = center - minCenterGap;
      }

      let nearestRight = mainCenter + minCenterGap;
      for (const node of right) {
        const desired = Math.max(centerById.get(node.personId) ?? nearestRight, nearestRight);
        const center = Math.min(maxCenter, desired);
        centerById.set(node.personId, center);
        nearestRight = center + minCenterGap;
      }
      for (const node of mainNodes) centerById.set(node.personId, mainCenter);
      return;
    }

    const ordered = [...offMain].sort((a, b) => (centerById.get(a.personId) ?? 0) - (centerById.get(b.personId) ?? 0) || a.personId - b.personId);
    const packed = ordered.map((node) => Math.max(minCenter, Math.min(maxCenter, centerById.get(node.personId) ?? mainCenter)));
    for (let index = 1; index < packed.length; index += 1) packed[index] = Math.max(packed[index], packed[index - 1] + minCenterGap);
    for (let index = packed.length - 2; index >= 0; index -= 1) packed[index] = Math.min(packed[index], packed[index + 1] - minCenterGap);
    if (packed.length && packed[0] < minCenter) {
      const shift = minCenter - packed[0];
      for (let index = 0; index < packed.length; index += 1) packed[index] += shift;
    }
    if (packed.length && packed[packed.length - 1] > maxCenter) {
      const shift = packed[packed.length - 1] - maxCenter;
      for (let index = 0; index < packed.length; index += 1) packed[index] -= shift;
    }
    ordered.forEach((node, index) => centerById.set(node.personId, packed[index]));
  };

  // Descendant positions must be final before their ancestors are anchored. Repeating the bottom-up pass lets a
  // whole short branch follow a child that itself moved during collision packing.
  for (let pass = 0; pass < 5; pass += 1) {
    for (const rowId of [...sortedGenerations].reverse()) {
      const row = rows.get(rowId) ?? [];
      for (const node of row) {
        if (mainLine.has(node.personId)) {
          centerById.set(node.personId, mainCenter);
          continue;
        }
        const childCenters = (children.get(node.personId) ?? [])
          .filter((id) => visibleSet.has(id) && centerById.has(id))
          .map((id) => centerById.get(id)!)
          .filter((value) => Number.isFinite(value));
        if (childCenters.length) centerById.set(node.personId, average(childCenters));
      }
      packRow(row);
    }
  }

  for (const [rowId, row] of rows) {
    for (const node of row) {
      const position = positions.get(node.personId);
      const center = centerById.get(node.personId);
      if (!position || center === undefined) continue;
      positions.set(node.personId, { ...position, x: center - FAMILY_NODE_WIDTH / 2, generation: rowId });
    }
  }
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
  const bottomAligned = alignShortDisconnectedBranches(baseGeneration, visibleSet, edges, mainLine);
  const generation = compactSideAncestorsTowardAttachments(bottomAligned, visibleSet, edges, mainLine);
  const nodeById = new Map(visibleNodes.map((node) => [node.personId, node]));
  const rows = new Map<number, FamilyLayoutNode[]>();
  for (const node of visibleNodes) {
    const rowId = generation.get(node.personId) ?? 0;
    rows.set(rowId, [...(rows.get(rowId) ?? []), node]);
  }
  for (const [rowId, row] of rows) rows.set(rowId, row.sort((a, b) => a.personId - b.personId));

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
    for (const row of rows.values()) row.forEach((node, index) => result.set(node.personId, index));
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
  ) => compareScore(score(primary.get(a.personId), indexes), score(primary.get(b.personId), indexes))
    || compareScore(score(secondary.get(a.personId), indexes), score(secondary.get(b.personId), indexes))
    || compareScore(score(familyNeighbors.get(a.personId), indexes), score(familyNeighbors.get(b.personId), indexes))
    || a.personId - b.personId;

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

  const branchSides = stabilizeBranchSides(rows, generation, visibleSet, mainLine, familyNeighbors, parentEdges);
  const mergePressure = new Map<number, number>();
  for (const childId of visibleSet) {
    const parentIds = (parents.get(childId) ?? []).filter((id) => visibleSet.has(id));
    if (parentIds.length < 2) continue;
    for (const id of [...parentIds, childId]) mergePressure.set(id, (mergePressure.get(id) ?? 0) + parentIds.length - 1);
  }

  const rowGap = (left: FamilyLayoutNode, right: FamilyLayoutNode) => {
    const pressure = (mergePressure.get(left.personId) ?? 0) + (mergePressure.get(right.personId) ?? 0);
    const sideGap = !mainLine.has(left.personId) && !mainLine.has(right.personId)
      && branchSides.get(left.personId) === -1 && branchSides.get(right.personId) === 1
      ? FAMILY_NODE_WIDTH
      : 0;
    return BASE_COLUMN_GAP + Math.min(150, pressure * 30) + sideGap;
  };

  let widest = 0;
  let centeredRequiredWidth = 0;
  for (const rowId of sortedGenerations) {
    const row = rows.get(rowId) ?? [];
    let rowWidth = row.length * FAMILY_NODE_WIDTH;
    for (let index = 0; index < row.length - 1; index += 1) rowWidth += rowGap(row[index], row[index + 1]);
    widest = Math.max(widest, rowWidth);

    // When one main-line node is forced to the exact center, the wider side must fit on BOTH halves of the canvas.
    // A plain total-row width is insufficient for asymmetric rows and previously caused right/left nodes to be
    // clamped together near the edge.
    const mainIndexes = row.map((node, index) => mainLine.has(node.personId) ? index : -1).filter((index) => index >= 0);
    if (mainIndexes.length === 1) {
      const mainIndex = mainIndexes[0];
      let leftDistance = 0;
      for (let index = mainIndex - 1; index >= 0; index -= 1) leftDistance += FAMILY_NODE_WIDTH + rowGap(row[index], row[index + 1]);
      let rightDistance = 0;
      for (let index = mainIndex + 1; index < row.length; index += 1) rightDistance += FAMILY_NODE_WIDTH + rowGap(row[index - 1], row[index]);
      const sideExtent = Math.max(leftDistance, rightDistance) + FAMILY_NODE_WIDTH / 2;
      centeredRequiredWidth = Math.max(centeredRequiredWidth, 2 * (SIDE_PADDING + sideExtent));
    }
  }
  const width = Math.max(1500, widest + SIDE_PADDING * 2, centeredRequiredWidth);
  const mainCenter = width / 2;
  const positions = new Map<number, FamilyTreePosition>();

  for (const rowId of sortedGenerations) {
    const row = rows.get(rowId) ?? [];
    if (!row.length) continue;
    const mainNodes = row.filter((node) => mainLine.has(node.personId));
    let x = SIDE_PADDING;
    const raw = new Map<number, number>();
    for (let index = 0; index < row.length; index += 1) {
      raw.set(row[index].personId, x);
      x += FAMILY_NODE_WIDTH;
      if (index < row.length - 1) x += rowGap(row[index], row[index + 1]);
    }
    const rowMin = Math.min(...row.map((node) => raw.get(node.personId) ?? 0));
    const rowMax = Math.max(...row.map((node) => (raw.get(node.personId) ?? 0) + FAMILY_NODE_WIDTH));
    let shift = (width - (rowMax - rowMin)) / 2 - rowMin;
    if (mainNodes.length) {
      const currentMainCenter = mainNodes.reduce((sum, node) => sum + (raw.get(node.personId) ?? 0) + FAMILY_NODE_WIDTH / 2, 0) / mainNodes.length;
      shift = mainCenter - currentMainCenter;
    }
    shift = Math.max(SIDE_PADDING - rowMin, Math.min(shift, width - SIDE_PADDING - rowMax));
    for (const node of row) {
      positions.set(node.personId, {
        x: (raw.get(node.personId) ?? 0) + shift,
        y: TOP_PADDING + rowId * FAMILY_ROW_GAP,
        generation: rowId,
      });
    }
  }

  anchorFamilyPositions(positions, rows, sortedGenerations, visibleSet, mainLine, branchSides, children, width);

  const maxGeneration = sortedGenerations.length ? Math.max(...sortedGenerations) : 0;
  const height = Math.max(720, TOP_PADDING + maxGeneration * FAMILY_ROW_GAP + FAMILY_NODE_HEIGHT + 170);
  return { positions, width, height, generations: generation, shownGenerations: sortedGenerations, nodeById };
}