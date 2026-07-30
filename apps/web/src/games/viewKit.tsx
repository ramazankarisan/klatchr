import { Box, Button, TextField, Typography } from '@mui/material';
import { type ReactNode, useState } from 'react';
import { nameOf } from '../players.js';
import { playerColor, tokens } from '../tokens.js';
import type { PublicPlayer } from '../transport/types.js';
import type { PlayerViewProps } from './viewProps.js';

/**
 * Shared paper-design primitives for game views. The platform hosts many games
 * against one design system (design.md), so the tape/name-tag/tally pieces live
 * here and every game's Host/Player view composes them — no per-game re-styling.
 */

/** Small eyebrow above a phone's content. */
export function PlayerKicker({ children }: { children: ReactNode }): ReactNode {
  return (
    <Typography variant="overline" sx={{ color: tokens.color.markerDeep, fontSize: 11 }}>
      {children}
    </Typography>
  );
}

/** Eyebrow on the shared board. */
export function HostKicker({ children }: { children: ReactNode }): ReactNode {
  return (
    <Typography variant="overline" sx={{ color: tokens.color.markerDeep, display: 'block', mb: 1 }}>
      {children}
    </Typography>
  );
}

/** A big board prompt. On the shared screen it scales with the viewport (8.2) so
 * it reads across a room — clamped so it never gets tiny on a phone-mirrored board
 * nor overflows a wide projector. */
export function Prompt({ text }: { text: string }): ReactNode {
  return (
    <Typography
      variant="h2"
      sx={{ fontSize: 'clamp(28px, 4.4vw, 52px)', lineHeight: 1.05, maxWidth: '18ch' }}
    >
      {text}
    </Typography>
  );
}

/** The player's marker-colour dot. */
export function PlayerDot({
  id,
  players,
  size = 12,
}: { id: string; players: readonly PublicPlayer[]; size?: number }): ReactNode {
  return (
    <Box
      component="span"
      sx={{
        width: size,
        height: size,
        borderRadius: '50%',
        flex: '0 0 auto',
        backgroundColor: playerColor(id, players),
      }}
    />
  );
}

/** Dot + name, inline — a player's marker label. */
export function NameLabel({
  id,
  players,
}: { id: string; players: readonly PublicPlayer[] }): ReactNode {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        fontWeight: 700,
        fontSize: 13,
      }}
    >
      <PlayerDot id={id} players={players} />
      {nameOf(id, players)}
    </Box>
  );
}

/** A tappable name-tag chip — a candidate in a picker; `selected` fills it. */
function NameChip({
  id,
  players,
  selected = false,
  onClick,
}: {
  id: string;
  players: readonly PublicPlayer[];
  selected?: boolean;
  onClick: () => void;
}): ReactNode {
  return (
    <Button
      onClick={onClick}
      sx={{
        textTransform: 'none',
        borderRadius: 999,
        border: '1px solid #e6d9c1',
        gap: 0.75,
        minHeight: 44, // ≥44px tap target (8.2)
        px: 1.75,
        color: selected ? tokens.color.card : tokens.color.ink,
        backgroundColor: selected ? tokens.color.ink : 'transparent',
        '&:hover': { backgroundColor: selected ? tokens.color.ink : undefined },
      }}
    >
      <PlayerDot id={id} players={players} size={11} />
      {nameOf(id, players)}
    </Button>
  );
}

/** A search field over name-tag chips; `selectedId` fills its chip. One tap → onPick. */
export function NamePicker({
  candidates,
  players,
  selectedId,
  onPick,
}: {
  candidates: readonly string[];
  players: readonly PublicPlayer[];
  selectedId?: string | undefined;
  onPick: (id: string) => void;
}): ReactNode {
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const shown = candidates.filter((id) => nameOf(id, players).toLowerCase().includes(q));
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      <TextField
        label="Search names"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        size="small"
      />
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
        {shown.map((id) => (
          <NameChip
            key={id}
            id={id}
            players={players}
            selected={id === selectedId}
            onClick={() => onPick(id)}
          />
        ))}
      </Box>
    </Box>
  );
}

/** The teal "Round done" reveal pill. */
function RoundDoneBadge(): ReactNode {
  return (
    <Box
      component="span"
      sx={{
        alignSelf: 'flex-start',
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        px: 1.25,
        py: 0.5,
        borderRadius: 1,
        backgroundColor: tokens.color.teal,
        color: '#fff',
      }}
    >
      Round done
    </Box>
  );
}

/** Centered "You got N <unit>" personal score headline. */
function ScoreHeadline({ value, unit }: { value: number; unit: string }): ReactNode {
  return (
    <Box sx={{ textAlign: 'center', mt: 1 }}>
      <Typography sx={{ color: tokens.color.inkSoft, fontSize: 14 }}>You got</Typography>
      <Typography variant="h2" sx={{ fontSize: 46 }}>
        {value}
      </Typography>
      <Typography sx={{ color: tokens.color.inkSoft, fontSize: 14 }}>{unit}</Typography>
    </Box>
  );
}

/** A phone reveal screen: the "Round done" pill, the personal headline, then the
 * game's own breakdown (cards, a tally, …) as children. */
export function PlayerResults({
  value,
  unit,
  children,
}: { value: number; unit: string; children: ReactNode }): ReactNode {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, flex: 1 }}>
      <RoundDoneBadge />
      <ScoreHeadline value={value} unit={unit} />
      <Box sx={{ mt: 1 }}>{children}</Box>
    </Box>
  );
}

/** Wrap a game's host view: narrow the opaque view by phase, render it, else nothing.
 * Keeps every game's `HostView` free of the same null-guard boilerplate. */
export function gameHostView<V>(
  narrow: (view: unknown) => V | null,
  render: (v: V, players: readonly PublicPlayer[]) => ReactNode,
): (props: { view: unknown; players: readonly PublicPlayer[] }) => ReactNode {
  return ({ view, players }) => {
    const v = narrow(view);
    return v === null ? null : render(v, players);
  };
}

/** The player-view counterpart to {@link gameHostView} — narrow, then render with
 * the full player props (players, youId, onEvent). */
export function gamePlayerView<V>(
  narrow: (view: unknown) => V | null,
  render: (v: V, props: PlayerViewProps) => ReactNode,
): (props: PlayerViewProps) => ReactNode {
  return (props) => {
    const v = narrow(props.view);
    return v === null ? null : render(v, props);
  };
}

/** A ranked horizontal bar per player (votes/points); the leader in marker. */
export function TallyBars({
  rows,
  players,
  height = 18,
}: {
  rows: readonly { playerId: string; points: number }[];
  players: readonly PublicPlayer[];
  height?: number;
}): ReactNode {
  const ranked = [...rows].sort((a, b) => b.points - a.points);
  const max = Math.max(1, ...ranked.map((r) => r.points));
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {ranked.map((r) => {
        const win = r.points === max && r.points > 0; // all tied leaders (F5 co-winners)
        return (
          <Box key={r.playerId} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography
              sx={{ fontFamily: tokens.font.display, fontWeight: 800, fontSize: 16, width: 96 }}
            >
              {nameOf(r.playerId, players)}
            </Typography>
            <Box
              sx={{
                flex: 1,
                height,
                borderRadius: `${tokens.radius.card}px`,
                backgroundColor: tokens.color.kraft2,
                overflow: 'hidden',
              }}
            >
              <Box
                sx={{
                  height: '100%',
                  width: `${(r.points / max) * 100}%`,
                  backgroundColor: win ? tokens.color.marker : tokens.color.teal,
                }}
              />
            </Box>
            <Typography
              sx={{
                fontFamily: tokens.font.mono,
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                width: 24,
                textAlign: 'right',
              }}
            >
              {r.points}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}
