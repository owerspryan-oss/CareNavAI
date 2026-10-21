/**
 * CareNav icon mark: coral speech bubble with a white heart, a teal bubble behind it
 * (DESIGN_SYSTEM.md §1). Drawn in tokens because the supplied PNG sits on a black, glowing
 * background and can't be placed on cream. Replace with an exported transparent asset when available.
 */
export function LogoMark({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        d="M20 9h17a9 9 0 0 1 9 9v12a9 9 0 0 1-9 9h-1l1 6-7-6h-1a9 9 0 0 1-9-9z"
        fill="var(--color-teal-100)"
        stroke="var(--color-teal-500)"
        strokeOpacity="0.35"
      />
      <path
        d="M10 3h18a9 9 0 0 1 9 9v14a9 9 0 0 1-9 9H17l-8 7 1-7a9 9 0 0 1-9-9V12a9 9 0 0 1 9-9z"
        fill="var(--color-coral-500)"
      />
      <path
        d="M19 28.5s-8-4.7-8-10.2A4.3 4.3 0 0 1 19 16a4.3 4.3 0 0 1 8 2.3c0 5.5-8 10.2-8 10.2z"
        fill="var(--color-on-accent)"
      />
    </svg>
  );
}
