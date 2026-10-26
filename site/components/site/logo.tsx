import { MARK_PATH, MARK_VIEWBOX } from "./mark-path";

/** The leaf-in-braces mark. Takes the current text colour. */
export function Mark({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox={MARK_VIEWBOX} className={className} fill="currentColor" aria-hidden>
      <path fillRule="evenodd" d={MARK_PATH} />
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 text-[1.0625rem] font-semibold tracking-[-0.03em] ${className}`}>
      <Mark className="h-6 w-auto" />
      elmory
    </span>
  );
}
