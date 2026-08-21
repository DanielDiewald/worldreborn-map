import type { ReactNode } from "react";

export function RequiredMark() {
  return <span className="form-required-mark" aria-hidden="true">*</span>;
}

export function OptionalMark() {
  return <span className="form-optional-mark">optional</span>;
}

export function FormRequiredLegend({ className = "" }: { className?: string }) {
  return <p className={`form-required-legend ${className}`.trim()}><RequiredMark/> Pflichtfeld</p>;
}

export function FormMessage({
  tone = "info",
  children,
  className = "",
}: {
  tone?: "info" | "success" | "error" | "warning";
  children: ReactNode;
  className?: string;
}) {
  const isError = tone === "error";
  return <div className={`form-message ${tone} ${className}`.trim()} role={isError ? "alert" : "status"} aria-live={isError ? "assertive" : "polite"}>{children}</div>;
}

export function FormErrorSummary({
  title = "Bitte überprüfe die markierten Felder.",
  errors,
}: {
  title?: string;
  errors: string[];
}) {
  if (!errors.length) return null;
  return <div className="form-error-summary" role="alert" tabIndex={-1}>
    <strong>{title}</strong>
    <ul>{errors.map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}</ul>
  </div>;
}

export function FormField({
  label,
  required = false,
  optional = false,
  hint,
  error,
  children,
  className = "",
}: {
  label: ReactNode;
  required?: boolean;
  optional?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return <label className={`form-field ${error ? "has-error" : ""} ${className}`.trim()}>
    <span className="form-field-label">{label}{required ? <RequiredMark/> : optional ? <OptionalMark/> : null}</span>
    {children}
    {hint ? <small className="form-field-hint">{hint}</small> : null}
    {error ? <small className="form-field-error">{error}</small> : null}
  </label>;
}
