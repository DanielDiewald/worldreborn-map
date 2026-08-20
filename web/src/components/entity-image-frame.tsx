type EntityImageFrameProps = {
  src?: string | null;
  alt?: string;
  fallback?: string;
  className?: string;
  loading?: "eager" | "lazy";
  decoding?: "sync" | "async" | "auto";
};

export function hasEntityImage(src?: string | null) {
  const value = src?.trim();
  return Boolean(value && value !== "noimage" && value !== "/noimg.jpg");
}

/**
 * A square presentation frame that preserves the complete source image.
 *
 * The foreground always uses object-fit: contain, so portrait and landscape art is never
 * stretched or cropped. A blurred copy fills the remaining square behind it purely for
 * presentation. This keeps list cards, hero portraits and species previews visually aligned
 * without requiring source assets to be pre-cropped to 1:1.
 */
export function EntityImageFrame({
  src,
  alt = "",
  fallback = "?",
  className = "",
  loading = "lazy",
  decoding = "async",
}: EntityImageFrameProps) {
  const image = hasEntityImage(src) ? src!.trim() : null;
  const classes = ["entity-image-frame", className].filter(Boolean).join(" ");

  return <span className={classes} data-has-image={image ? "true" : "false"}>
    {image ? <>
      <img className="entity-image-backdrop" src={image} alt="" aria-hidden="true" loading={loading} decoding={decoding}/>
      <img className="entity-image-content" src={image} alt={alt} loading={loading} decoding={decoding}/>
    </> : <span className="entity-image-fallback" aria-hidden="true">{fallback}</span>}
  </span>;
}
