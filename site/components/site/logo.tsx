export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 font-semibold tracking-tight ${className}`}>
      <span
        aria-hidden
        className="grid size-7 place-items-center rounded-full bg-accent text-[13px] font-bold text-accent-foreground"
      >
        e
      </span>
      elmory
    </span>
  );
}
