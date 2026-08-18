export type AncestorGroupingEdge = {
  a: number;
  b: number;
  code: string;
};

export type AncestorRelationshipGroup<T extends AncestorGroupingEdge> = {
  descendantId: number;
  ancestorIds: number[];
  edges: T[];
  joint: boolean;
};

const PARTNER_CODES = new Set(["spouse", "romantic", "ex_partner", "engaged", "widowed_from"]);

function pairKey(a: number, b: number) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/**
 * Ancestor relationships are explicit per person. A marriage never makes a spouse
 * an ancestor automatically. When two (or more) explicit ancestors of the same
 * descendant are also connected by a romantic/partner relationship, they form one
 * visual ancestor unit. Removing either ancestor edge immediately turns the unit
 * back into a single-ancestor connection.
 */
export function groupAncestorRelationships<T extends AncestorGroupingEdge>(edges: T[]): AncestorRelationshipGroup<T>[] {
  const ancestorEdges = edges.filter((edge) => edge.code === "ancestor");
  if (!ancestorEdges.length) return [];

  const partnerPairs = new Set(
    edges.filter((edge) => PARTNER_CODES.has(edge.code)).map((edge) => pairKey(edge.a, edge.b)),
  );
  const byDescendant = new Map<number, T[]>();
  for (const edge of ancestorEdges) {
    byDescendant.set(edge.b, [...(byDescendant.get(edge.b) ?? []), edge]);
  }

  const groups: AncestorRelationshipGroup<T>[] = [];
  for (const [descendantId, descendantEdges] of [...byDescendant.entries()].sort((a, b) => a[0] - b[0])) {
    const remaining = [...descendantEdges].sort((a, b) => a.a - b.a);
    while (remaining.length) {
      const seed = remaining.shift()!;
      const component = [seed];
      let changed = true;
      while (changed) {
        changed = false;
        for (let index = remaining.length - 1; index >= 0; index -= 1) {
          const candidate = remaining[index];
          const connected = component.some((member) => partnerPairs.has(pairKey(member.a, candidate.a)));
          if (!connected) continue;
          component.push(candidate);
          remaining.splice(index, 1);
          changed = true;
        }
      }
      component.sort((a, b) => a.a - b.a);
      groups.push({
        descendantId,
        ancestorIds: component.map((edge) => edge.a),
        edges: component,
        joint: component.length > 1,
      });
    }
  }

  return groups.sort((a, b) => a.descendantId - b.descendantId || a.ancestorIds[0] - b.ancestorIds[0]);
}
