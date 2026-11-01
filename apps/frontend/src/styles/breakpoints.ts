// The three widths where the layout changes: at 900 the shell goes from the
// sidebar to the phone's bar, from 1100 two columns fit, from 1440 there is
// room to spare. CSS variables can't be used in a media query, so stylesheets
// write `@media (--shell)` and vite.config.ts puts the width in.
const SHELL = 900;
const TWO_COLUMNS = 1100;
const WIDE = 1440;

export const MEDIA = {
  shell: `(max-width: ${SHELL}px)`,
  aboveShell: `(min-width: ${SHELL + 1}px)`,
  twoColumns: `(min-width: ${TWO_COLUMNS}px)`,
  wide: `(min-width: ${WIDE}px)`,
} as const;

const NAMED_MEDIA: Record<string, string> = {
  "--shell": MEDIA.shell,
  "--above-shell": MEDIA.aboveShell,
  "--two-columns": MEDIA.twoColumns,
  "--wide": MEDIA.wide,
};

export function resolveNamedMedia(css: string): string {
  return css.replace(/@media \((--[a-z-]+)\)/g, (_match, name: string) => {
    const query = NAMED_MEDIA[name];
    if (!query) throw new Error(`Unknown breakpoint: ${name}`);
    return `@media ${query}`;
  });
}
