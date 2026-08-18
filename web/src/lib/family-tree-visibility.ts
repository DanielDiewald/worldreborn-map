import { isFamilyParentEdge, isFamilyStructureEdge, type FamilyLayoutEdge } from "@/lib/family-tree-layout";

export function buildFamilyExpansionMap(personIds: Iterable<number>, edges: FamilyLayoutEdge[]) {
  const ids = new Set(personIds);
  const result = new Map<number, Set<number>>();
  const childrenByParent = new Map<number, number[]>();

  const add = (a: number, b: number) => {
    if (!ids.has(a) || !ids.has(b) || a === b) return;
    const neighbors = result.get(a) ?? new Set<number>();
    neighbors.add(b);
    result.set(a, neighbors);
  };

  for (const edge of edges) {
    if (!isFamilyStructureEdge(edge) || !ids.has(edge.a) || !ids.has(edge.b)) continue;
    add(edge.a, edge.b);
    add(edge.b, edge.a);
    if (isFamilyParentEdge(edge)) {
      childrenByParent.set(edge.a, [...(childrenByParent.get(edge.a) ?? []), edge.b]);
    }
  }

  // Siblings are immediate family context even if no explicit sibling relationship
  // was stored. This keeps progressive expansion intuitive for legacy trees that
  // only contain parent->child rows.
  for (const childIds of childrenByParent.values()) {
    const siblings = [...new Set(childIds)].sort((a, b) => a - b);
    for (let left = 0; left < siblings.length; left += 1) {
      for (let right = left + 1; right < siblings.length; right += 1) {
        add(siblings[left], siblings[right]);
        add(siblings[right], siblings[left]);
      }
    }
  }

  return result;
}

export function resolveProgressiveFamilyVisibility(
  personIds: Iterable<number>,
  mainLineIds: Iterable<number>,
  expandedPersonIds: Iterable<number>,
  edges: FamilyLayoutEdge[],
) {
  const allIds = new Set(personIds);
  const visible = new Set([...mainLineIds].filter((id) => allIds.has(id)));
  const expanded = new Set(expandedPersonIds);
  const neighbors = buildFamilyExpansionMap(allIds, edges);

  let changed = true;
  while (changed) {
    changed = false;
    for (const personId of expanded) {
      if (!visible.has(personId)) continue;
      for (const neighborId of neighbors.get(personId) ?? []) {
        if (visible.has(neighborId)) continue;
        visible.add(neighborId);
        changed = true;
      }
    }
  }

  return { visible, neighbors };
}

export function collectFamilyConnectedIds(mainLineIds: Iterable<number>, neighbors: Map<number, Set<number>>) {
  const connected = new Set<number>();
  const queue: number[] = [];
  for (const id of mainLineIds) {
    if (connected.has(id)) continue;
    connected.add(id);
    queue.push(id);
  }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const id = queue[cursor];
    for (const neighborId of neighbors.get(id) ?? []) {
      if (connected.has(neighborId)) continue;
      connected.add(neighborId);
      queue.push(neighborId);
    }
  }
  return connected;
}
