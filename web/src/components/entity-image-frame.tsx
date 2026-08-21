import type { CSSProperties } from "react";
import type { EntityImageCrop } from "@/lib/entity-image-crop";

type EntityImageFrameProps = {
  src?: string | null;
  alt?: string;
  fallback?: string;
  className?: string;
  loading?: "eager" | "lazy";
  decoding?: "sync" | "async" | "auto";
  style?: CSSProperties;
  crop?: EntityImageCrop | null;
  mode?: "profile" | "thumbnail";
};

export function hasEntityImage(src?: string | null) {
  const value = src?.trim();
  return Boolean(value && value !== "noimage" && value !== "/noimg.jpg");
}

/**
 * Square entity image frame with an optional non-destructive crop.
 * Generated avatar-derivative URLs automatically use the one-image thumbnail path even when the
 * caller does not explicitly opt in, so older list components benefit without extra hydration.
 */
export function EntityImageFrame({
  src,
  alt = "",
  fallback = "?",
  className = "",
  loading = "lazy",
  decoding = "async",
  style,
  crop = null,
  mode = "profile",
}: EntityImageFrameProps) {
  const image = hasEntityImage(src) ? src!.trim() : null;
  const effectiveMode = mode === "profile" && image?.includes("/entity-images/") ? "thumbnail" : mode;
  const classes = ["entity-image-frame", crop ? "entity-image-frame-cropped" : "", effectiveMode === "thumbnail" ? "entity-image-frame-thumbnail" : "", className].filter(Boolean).join(" ");
  const rootStyle: CSSProperties = {
    position: "relative",
    display: "grid",
    placeItems: "center",
    aspectRatio: "1 / 1",
    overflow: "hidden",
    isolation: "isolate",
    background: "radial-gradient(circle at 50% 35%, rgba(199,164,93,.18), rgba(15,18,23,.98) 72%)",
    ...style,
  };
  const cropStyle: CSSProperties | undefined = crop ? {
    objectPosition: `${crop.x}% ${crop.y}%`,
    transform: `scale(${crop.zoom})`,
    transformOrigin: `${crop.x}% ${crop.y}%`,
  } : undefined;
  const passiveImageStyle: CSSProperties = { userSelect: "none", pointerEvents: "none" };

  if (effectiveMode === "thumbnail") {
    return <span className={classes} style={rootStyle} data-has-image={image ? "true" : "false"} data-has-crop={crop ? "true" : "false"}>
      {image ? <img
        className={crop ? "entity-image-crop-content" : "entity-image-content"}
        src={image}
        alt={alt}
        loading={loading}
        decoding={decoding}
        draggable={false}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: crop ? "cover" : "contain",
          objectPosition: crop ? undefined : "center",
          ...passiveImageStyle,
          ...cropStyle,
        }}
      /> : <span className="entity-image-fallback" aria-hidden="true" style={{position:"relative",zIndex:1}}>{fallback}</span>}
    </span>;
  }

  return <span className={classes} style={rootStyle} data-has-image={image ? "true" : "false"} data-has-crop={crop ? "true" : "false"}>
    {image ? crop ? <>
      <img
        className="entity-image-crop-content"
        src={image}
        alt={alt}
        loading={loading}
        decoding={decoding}
        draggable={false}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          ...passiveImageStyle,
          ...cropStyle,
        }}
      />
      <span aria-hidden="true" style={{position:"absolute",inset:0,zIndex:2,boxShadow:"inset 0 0 0 1px rgba(255,255,255,.08)",pointerEvents:"none"}}/>
    </> : <>
      <img
        className="entity-image-backdrop"
        src={image}
        alt=""
        aria-hidden="true"
        loading={loading}
        decoding={decoding}
        draggable={false}
        style={{
          position: "absolute",
          inset: "-8%",
          zIndex: 0,
          width: "116%",
          height: "116%",
          maxWidth: "none",
          objectFit: "cover",
          filter: "blur(14px) saturate(.72) brightness(.48)",
          transform: "scale(1.04)",
          opacity: .82,
          pointerEvents: "none",
          userSelect: "none",
        }}
      />
      <img
        className="entity-image-content"
        src={image}
        alt={alt}
        loading={loading}
        decoding={decoding}
        draggable={false}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          width: "100%",
          height: "100%",
          objectFit: "contain",
          objectPosition: "center",
          ...passiveImageStyle,
        }}
      />
      <span aria-hidden="true" style={{position:"absolute",inset:0,zIndex:2,boxShadow:"inset 0 0 0 1px rgba(255,255,255,.055)",pointerEvents:"none"}}/>
    </> : <span className="entity-image-fallback" aria-hidden="true" style={{position:"relative",zIndex:1}}>{fallback}</span>}
  </span>;
}
