/** Tiny class-name joiner. Keeps conditional Tailwind readable without a dependency. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
