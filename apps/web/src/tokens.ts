/**
 * Design tokens — the single source in code for design.md's paper direction.
 * The MUI theme (theme.ts) maps these onto palette/typography; the paper-only
 * devices (tape, name-tags, index cards) read them directly via `sx`.
 */
export const tokens = {
  color: {
    kraft: '#F0E7D8',
    kraft2: '#E7DCC8',
    card: '#FBF6EC',
    ink: '#2B2620',
    inkSoft: '#6B6154',
    marker: '#E8623D',
    markerDeep: '#C14A2B',
    teal: '#2E8B7B',
    dymo: '#34302A',
  },
  players: ['#E8623D', '#E0A32E', '#2E8B7B', '#3E7CB1', '#8A5A83', '#6E7B3E', '#F2996E', '#55707A'],
  font: {
    display: '"Helvetica Neue", Arial, system-ui, sans-serif',
    body: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    hand: '"Bradley Hand", "Segoe Print", "Comic Sans MS", cursive',
    mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  },
  radius: { card: 6, control: 8, pill: 999 },
} as const;

/** A stable marker color per player — by roster position, else hashed from id. */
export function playerColor(id: string, roster: readonly { id: string }[]): string {
  const pos = roster.findIndex((p) => p.id === id);
  const idx = pos >= 0 ? pos : hash(id);
  return tokens.players[idx % tokens.players.length] ?? tokens.color.marker;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
