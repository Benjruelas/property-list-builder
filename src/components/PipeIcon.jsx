/**
 * Hardware pipe icon (L-shaped section with flanges) — same glyph as the Pipes
 * menu / MobileActionBar. Inherits `currentColor` for stroke.
 */
export function PipeIcon({ className, ...props }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <rect x="3" y="2" width="8" height="3" rx="0.5" />
      <line x1="3.5" y1="3.5" x2="10.5" y2="3.5" />
      <rect x="19" y="12" width="3" height="8" rx="0.5" />
      <line x1="20.5" y1="12.5" x2="20.5" y2="19.5" />
      <path d="M5 5 L5 13 Q5 18 10 18 L19 18" />
      <path d="M9 5 L9 13 Q9 14 10 14 L19 14" />
    </svg>
  )
}
