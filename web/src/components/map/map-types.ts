export type WorldMapConfig = {
  mapId: number;
  mapType: "tile" | "image";
  tileUrl: string | null;
  imagePath: string | null;
  minZoom: number;
  maxZoom: number;
  centerLat: number | null;
  centerLng: number | null;
  bounds: unknown;
  config: Record<string, unknown>;
};

export type WorldMapLayer = {
  layer_id: string;
  name: string;
  layer_type: "raster" | "vector";
  source_type: "image" | "tile" | "geojson" | "drawn" | "media";
  source_url: string | null;
  media_id: string | null;
  layer_role: string | null;
  opacity: number;
  z_index: number;
  visible_by_default: boolean;
  visibility_mode?: string;
  style: Record<string, unknown>;
  config: Record<string, unknown>;
  locked?: boolean;
};

export type WorldMapFeature = {
  feature_id: string;
  layer_id: string;
  geometry: { type: string; coordinates: unknown };
  entity_type: string | null;
  entity_id: string | null;
  label: string;
  short_description: string | null;
  visibility_mode: string;
  style: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

export type WorldMapMarker = {
  marker_id: string | number;
  marker_type: string;
  entity_type?: string | null;
  entity_id?: string | number | null;
  entity_label?: string | null;
  entity_kind?: string | null;
  coordinate_mode: string;
  lat: number | null;
  lng: number | null;
  x: number | null;
  y: number | null;
  icon?: string | null;
  label: string;
  short_description?: string | null;
  layer: string;
  z_index: number;
};

export type MapSearchItem = {
  kind: "location" | "person" | "feature" | "marker";
  id: number;
  name: string;
  subtitle: string | null;
  featureId: number | null;
  markerId: number | null;
  href: string | null;
};
