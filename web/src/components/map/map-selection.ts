import type { WorldMapFeature } from "./map-types";

export type MapSelectionCandidate = {
  featureId: number;
  label: string;
  geometryType: string;
  locationKind: string | null;
  extentArea: number;
};

function semanticRank(candidate: MapSelectionCandidate) {
  const type = candidate.geometryType;
  if (type === "Point" || type === "MultiPoint") return 0;
  if (type === "LineString" || type === "MultiLineString") return 1;
  if (candidate.locationKind === "province") return 2;
  if (candidate.locationKind === "region") return 3;
  if (candidate.locationKind === "country") return 5;
  if (type === "Polygon" || type === "MultiPolygon") return 4;
  return 6;
}

export function rankSelectionCandidates(candidates: MapSelectionCandidate[]) {
  return [...candidates].sort((a, b) => {
    const semantic = semanticRank(a) - semanticRank(b);
    if (semantic) return semantic;
    const area = a.extentArea - b.extentArea;
    if (Math.abs(area) > 1e-6) return area;
    return a.label.localeCompare(b.label, "de");
  });
}

export function selectionCandidateFromRow(featureId: number, row: WorldMapFeature, extentArea: number): MapSelectionCandidate {
  return {
    featureId,
    label: row.label,
    geometryType: row.geometry.type,
    locationKind: row.location_kind ?? (typeof row.metadata?.tool === "string" ? row.metadata.tool : null),
    extentArea,
  };
}
