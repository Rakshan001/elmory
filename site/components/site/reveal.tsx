/**
 * Fades a block in as it scrolls into view, with a CSS scroll-driven animation. Content is
 * visible by default; browsers without view timelines, and reduced-motion users, just see it.
 */
export function Reveal({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`reveal ${className}`}>{children}</div>;
}
