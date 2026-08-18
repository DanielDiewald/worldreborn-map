import { isFamilyParentEdge, isFamilyStructureEdge, type FamilyLayoutEdge } from "@/lib/family-tree-layout";

export type FamilyVisibilityPerson = {
  personId: number;
  gender?: string | null;
};

export type FamilyVisibilityEdge = FamilyLayoutEdge & {
  category?: string;
  source?: string;
  metadata?: Record<string, unknown> | null;
};

export type HouseDescentRule = "patrilineal" | "matrilineal" | "none";

const BLOOD_PARENT_CODES = new Set(["parent"]);
const EXPANSION_RELATION_CODES = new Set(["ancestor"]);
const MALE_GENDERS = new Set(["m", "male", "man", "mann", "männlich", "maennlich", "masculine"]);
const FEMALE_GENDERS = new Set(["f", "female", "woman", "frau", "weiblich", "feminin", "feminine"]);

function pairKey(a: number, b: number) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function normalizedGender(value: string | null | undefined): "male" | "female" | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  if (MALE_GENDERS.has(normalized)) return "male";
  if (FEMALE_GENDERS.has(normalized)) return "female";
  return null;
}

function houseDescentRule(edge: FamilyVisibilityEdge | undefined): HouseDescentRule {
  const raw = edge?.metadata?.house_descent_rule;
  return raw === "matrilineal" || raw === "none" || raw === "patrilineal" ? raw : "patrilineal";
}

function isExpansionEdge(edge: FamilyVisibilityEdge) {
  return isFamilyStructureEdge(edge) || EXPANSION_RELATION_CODES.has(edge.code);
}

export function buildFamilyExpansionMap(personIds: Iterable<number>, edges: FamilyVisibilityEdge[]) {
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
    if (!isExpansionEdge(edge) || !ids.has(edge.a) || !ids.has(edge.b)) continue;
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

export function resolveProgressiveFamilyVisibilityFromMap(
  personIds: Iterable<number>,
  baseVisibleIds: Iterable<number>,
  expandedPersonIds: Iterable<number>,
  neighbors: Map<number, Set<number>>,
) {
  const allIds = new Set(personIds);
  const visible = new Set([...baseVisibleIds].filter((id) => allIds.has(id)));
  const expanded = new Set(expandedPersonIds);

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

  return visible;
}

export function resolveProgressiveFamilyVisibility(
  personIds: Iterable<number>,
  baseVisibleIds: Iterable<number>,
  expandedPersonIds: Iterable<number>,
  edges: FamilyVisibilityEdge[],
) {
  const allIds = new Set(personIds);
  const neighbors = buildFamilyExpansionMap(allIds, edges);
  return {
    visible: resolveProgressiveFamilyVisibilityFromMap(allIds, baseVisibleIds, expandedPersonIds, neighbors),
    neighbors,
  };
}

/**
 * Resolve the people who are considered born into the named house.
 *
 * Rules:
 * - the saved/derived succession line is always in the house;
 * - only biological `parent` edges propagate house membership automatically;
 * - with two known parents, house descent is paternal by default;
 * - a spouse relationship may explicitly switch the child set to matrilineal descent;
 * - `none` means that marriage does not automatically place shared children in either house;
 * - spouses themselves are never added merely because of the marriage;
 * - a one-parent legacy record follows its only known biological parent.
 *
 * Repeated upward/downward propagation from the main line naturally includes paternal
 * grandparents, siblings, uncles/aunts born into the house and their house-born descendants,
 * while children who leave through a non-matrilineal daughter stay outside until expanded.
 */
export function resolveHouseFamilyVisibility(
  people: FamilyVisibilityPerson[],
  mainLineIds: Iterable<number>,
  edges: FamilyVisibilityEdge[],
) {
  const ids = new Set(people.map((person) => person.personId));
  const personById = new Map(people.map((person) => [person.personId, person]));
  const parentsByChild = new Map<number, number[]>();
  const spouseByPair = new Map<string, FamilyVisibilityEdge>();

  for (const edge of edges) {
    if (!ids.has(edge.a) || !ids.has(edge.b)) continue;
    if (edge.directed && BLOOD_PARENT_CODES.has(edge.code)) {
      parentsByChild.set(edge.b, [...(parentsByChild.get(edge.b) ?? []), edge.a]);
    }
    if (edge.code === "spouse" && !edge.directed) spouseByPair.set(pairKey(edge.a, edge.b), edge);
  }

  for (const [childId, parentIds] of parentsByChild) {
    parentsByChild.set(childId, [...new Set(parentIds)].sort((a, b) => a - b));
  }

  const transmittingParent = (childId: number) => {
    const parentIds = parentsByChild.get(childId) ?? [];
    if (!parentIds.length) return null;
    if (parentIds.length === 1) return parentIds[0];

    const spouse = parentIds.length === 2 ? spouseByPair.get(pairKey(parentIds[0], parentIds[1])) : undefined;
    const rule = houseDescentRule(spouse);
    if (rule === "none") return null;

    const desiredGender = rule === "matrilineal" ? "female" : "male";
    const candidates = parentIds.filter((personId) => normalizedGender(personById.get(personId)?.gender) === desiredGender);
    return candidates.length === 1 ? candidates[0] : null;
  };

  const house = new Set([...mainLineIds].filter((id) => ids.has(id)));
  let changed = true;
  while (changed) {
    changed = false;
    for (const childId of parentsByChild.keys()) {
      const parentId = transmittingParent(childId);
      if (parentId == null) continue;
      if (house.has(childId) && !house.has(parentId)) {
        house.add(parentId);
        changed = true;
      }
      if (house.has(parentId) && !house.has(childId)) {
        house.add(childId);
        changed = true;
      }
    }
  }

  return house;
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
