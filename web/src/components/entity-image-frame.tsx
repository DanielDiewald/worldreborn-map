import type { CSSProperties } from "react";

type EntityImageFrameProps = {
  src?: string | null;
  alt?: string;
  fallback?: string;
  className?: string;
  loading?: "eager" | "lazy";
  decoding?: "sync" | "async" | "auto";
  style?: CSSProperties;
};

export function hasEntityImage(src?: string | null) {
  const value = src?.trim();
  return Boolean(value && value !== "noimage" && value !== "/noimg.jpg");
}

/**
 * Square presentation frame that always preserves the complete source artwork.
 *
 * The original image is rendered with object-fit: contain. A blurred, darkened duplicate fills
 * the square behind it, so portrait and landscape art can live inside a 1:1 UI without being
 * stretched, cropped or surrounded by a flat black box.
 */
export function EntityImageFrame({
  src,
  alt = "",
  fallback = "?",
  className = "",
  loading = "lazy",
  decoding = "async",
  style,
}: EntityImageFrameProps) {
  const image = hasEntityImage(src) ? src!.trim() : null;
  const classes = ["entity-image-frame", className].filter(Boolean).join(" ");
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

  return <span className={classes} style={rootStyle} data-has-image={image ? "true" : "false"}>
    {image ? <>
      <img
        className="entity-image-backdrop"
        src={image}
        alt=""
        aria-hidden="true"
        loading={loading}
        decoding={decoding}
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
        }}
      />
      <img
        className="entity-image-content"
        src={image}
        alt={alt}
        loading={loading}
        decoding={decoding}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          width: "100%",
          height: "100%",
          objectFit: "contain",
          objectPosition: "center",
        }}
      />
      <span aria-hidden="true" style={{position:"absolute",inset:0,zIndex:2,boxShadow:"inset 0 0 0 1px rgba(255,255,255,.055)",pointerEvents:"none"}}/>
    </> : <span className="entity-image-fallback" aria-hidden="true" style={{position:"relative",zIndex:1}}>{fallback}</span>}
  </span>;
}
