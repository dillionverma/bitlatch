export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 10V7a6 6 0 0 1 12 0v2M5 10h14v11H5z"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 14v3" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" />
    </svg>
  );
}
