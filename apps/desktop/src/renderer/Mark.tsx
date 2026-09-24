import { claspPaths } from '@latch/shared/brand';

export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="200 200 624 624"
      fill="currentColor"
      aria-hidden="true"
    >
      {claspPaths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
