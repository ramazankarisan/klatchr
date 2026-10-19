import { Box, Button, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { tvType } from '../components/board.js';
import { BoardChip } from '../games/progressChips.js';
import { type GameOption, gameCatalog } from '../games/registry.js';
import { playerColor, tokens } from '../tokens.js';
import type { ViewFrame } from '../transport/types.js';

/** The host's game cards (6.2, option A): name, blurb, player range; the pick in marker. */
function GamePicker({
  games,
  selectedId,
  onSelect,
}: {
  games: readonly GameOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}): ReactNode {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {games.map((game) => {
        const sel = game.id === selectedId;
        return (
          <Button
            key={game.id}
            onClick={() => onSelect(game.id)}
            sx={{
              textTransform: 'none',
              textAlign: 'left',
              alignItems: 'flex-start',
              flexDirection: 'column',
              gap: 0.5,
              p: 'clamp(14px, 1.3vw, 24px) clamp(16px, 1.5vw, 28px)',
              color: tokens.color.ink,
              backgroundColor: tokens.color.card,
              border: `1px solid ${sel ? tokens.color.markerDeep : '#e8dcc6'}`,
              borderRadius: `${tokens.radius.card}px`,
              boxShadow: sel
                ? `0 0 0 1px ${tokens.color.markerDeep}, 1px 3px 6px rgba(43,38,32,.14)`
                : '1px 3px 6px rgba(43,38,32,.14)',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                gap: 1,
              }}
            >
              <Typography variant="h3" sx={{ fontSize: 'clamp(20px, 2vw, 34px)' }}>
                {game.name}
              </Typography>
              {sel ? (
                <Typography
                  sx={{ color: tokens.color.markerDeep, fontWeight: 800, fontSize: tvType.body }}
                >
                  ✓ selected
                </Typography>
              ) : null}
            </Box>
            <Typography sx={{ color: tokens.color.inkSoft, fontSize: tvType.body }}>
              {game.description}
            </Typography>
            <Typography
              sx={{
                fontFamily: tokens.font.mono,
                fontSize: 'clamp(12px, 1vw, 18px)',
                color: tokens.color.markerDeep,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {game.minPlayers}–{game.maxPlayers} players
            </Typography>
          </Button>
        );
      })}
    </Box>
  );
}

/** The lobby's right column: the picker, the roster count, then a name chip per player. */
export function Lobby({
  frame,
  onSelect,
}: { frame: ViewFrame; onSelect: (id: string) => void }): ReactNode {
  // Cap comes from the picked game (8.2) — never a hardcoded 50. Over the seat cap
  // it reads seats-vs-waiting (X2), not a nonsensical "15 / 12".
  const game = gameCatalog().find((g) => g.id === frame.selectedGameId);
  const n = frame.players.length;
  const roster =
    game === undefined
      ? `${n} in the room`
      : n > game.maxPlayers
        ? `${game.maxPlayers} playing · ${n - game.maxPlayers} waiting`
        : `${n} / ${game.maxPlayers} in the room`;
  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1,
          mb: 1.5,
        }}
      >
        <Typography variant="h3" sx={{ fontSize: 'clamp(24px, 2.4vw, 44px)' }}>
          Choose tonight’s game
        </Typography>
        <Typography
          sx={{
            fontFamily: tokens.font.mono,
            color: tokens.color.markerDeep,
            fontWeight: 700,
            fontSize: tvType.body,
          }}
        >
          {roster}
        </Typography>
      </Box>
      <GamePicker games={gameCatalog()} selectedId={frame.selectedGameId} onSelect={onSelect} />
      {frame.players.length > 0 ? (
        // Compact chips, not big tiles — reads at 50 (plan-9 §F2), ≥22px on a TV (UX-1).
        // Waiting players dimmed.
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 'clamp(8px, 0.9vw, 14px)', mt: 3 }}>
          {frame.players.map((p) => (
            <BoardChip key={p.id} dim={p.spectator}>
              <Box
                component="span"
                aria-hidden
                sx={{
                  width: '0.6em',
                  height: '0.6em',
                  borderRadius: '50%',
                  backgroundColor: playerColor(p.id, frame.players),
                }}
              />
              {p.nickname}
              {p.spectator ? ' · waiting' : ''}
            </BoardChip>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}
