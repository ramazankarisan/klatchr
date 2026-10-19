import { Box, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { tokens } from '../tokens.js';
import {
  DymoCode,
  LiveRegion,
  ReconnectingTape,
  ScreenTitle,
  dimWhileReconnecting,
  kraftBg,
} from './paper.js';

/** Board-scale type: clamped to the viewport so it reads from the couch on a 1080p/4K TV
 * and still fits a laptop (UX-1). Shared by the host screen's own pieces. */
export const tvType = {
  kicker: 'clamp(16px, 1.4vw, 24px)',
  body: 'clamp(16px, 1.3vw, 24px)',
  chip: 'clamp(22px, 1.9vw, 30px)',
  button: 'clamp(18px, 1.6vw, 30px)',
} as const;

/** The lobby's code-first join block: the room code on hero tape (the largest thing on the
 * board), then the join link "Join at <host>/<CODE>" (UX-2: the link opens the join form with
 * the code filled in). The host is this page's own origin — the VITE_WS_URL rule: never a
 * baked host. */
function JoinHero({ code, joinHost }: { code: string; joinHost: string }): ReactNode {
  const quiet = { fontSize: 'clamp(18px, 1.6vw, 26px)', color: tokens.color.inkSoft } as const;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 'clamp(16px, 1.8vw, 28px)' }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'flex-start' }}>
        <Typography sx={quiet}>Room code</Typography>
        <DymoCode code={code} size="hero" />
      </Box>
      {joinHost === '' ? null : (
        <Box>
          <Typography sx={{ fontSize: 'clamp(28px, 2.8vw, 44px)', overflowWrap: 'anywhere' }}>
            Join at{' '}
            <Box component="b" sx={{ fontFamily: tokens.font.mono }}>
              {joinHost}/{code}
            </Box>
          </Typography>
        </Box>
      )}
    </Box>
  );
}

/** In play the code sits small in the corner, with a quiet join line under it. */
function CornerCode({ code, joinHost }: { code: string; joinHost: string }): ReactNode {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
      <DymoCode code={code} />
      {joinHost === '' ? null : (
        <Typography sx={{ fontSize: 'clamp(13px, 1vw, 18px)', color: tokens.color.inkSoft }}>
          join at {joinHost}/{code}
        </Typography>
      )}
    </Box>
  );
}

/** The host shared-screen board (8.2, UX-1): a viewport-relative container that fills a
 * TV (up to 1800px wide), not a laptop-sized cap. In the lobby it is code-first — a join
 * hero beside the game's content; in-game the code shrinks to the top corner, with a small
 * "join at <host>" line under it for latecomers (they join as spectators). The top bar
 * carries the round pill (`badge`), a status `hint` and the quiet `corner` control. */
export function Board({
  code,
  hint,
  badge,
  corner,
  joinHost,
  codeFirst = false,
  heroFoot,
  children,
  reconnecting,
  announce,
}: {
  code: string;
  hint?: ReactNode;
  badge?: ReactNode;
  corner?: ReactNode;
  /** Where players join (this page's host); omitted on the recover / opening boards. */
  joinHost?: string;
  /** The lobby: show the code-first join hero instead of the corner code. */
  codeFirst?: boolean;
  /** Under the join hero in the code-first lobby — the picked game's how-to-play (UX-2). */
  heroFoot?: ReactNode;
  children: ReactNode;
  reconnecting?: boolean;
  /** The phase, for the board's polite live region (UX-2). */
  announce?: string;
}): ReactNode {
  return (
    <Box sx={{ width: 'min(100%, 1800px)', mx: 'auto' }}>
      <Box
        sx={{
          ...kraftBg,
          border: `1px solid ${tokens.color.kraft2}`,
          borderRadius: 2,
          overflow: 'hidden',
          boxShadow: tokens.elevation.board,
          color: tokens.color.ink,
        }}
      >
        <ScreenTitle>Klatchr — host board</ScreenTitle>
        <LiveRegion text={announce} />
        {reconnecting ? <ReconnectingTape /> : null}
        <Box sx={reconnecting ? dimWhileReconnecting : undefined}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 2,
              p: 'clamp(14px, 1.6vw, 28px) clamp(20px, 3.4vw, 64px)',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
              {codeFirst ? (
                <Typography
                  sx={{
                    fontFamily: tokens.font.mono,
                    fontSize: 'clamp(15px, 1.3vw, 22px)',
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: tokens.color.inkSoft,
                  }}
                >
                  Join on your phone
                </Typography>
              ) : null}
              {badge}
              {hint ? (
                <Typography sx={{ fontSize: tvType.body, color: tokens.color.inkSoft }}>
                  {hint}
                </Typography>
              ) : null}
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, ml: 'auto' }}>
              {corner}
              {codeFirst ? null : <CornerCode code={code} joinHost={joinHost ?? ''} />}
            </Box>
          </Box>
          <Box sx={{ p: '8px clamp(20px, 3.4vw, 64px) clamp(24px, 3vw, 56px)' }}>
            {codeFirst ? (
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: {
                    xs: 'minmax(0, 1fr)',
                    lg: 'minmax(0, 1fr) minmax(0, 1.15fr)',
                  },
                  gap: 'clamp(28px, 3.4vw, 64px)',
                  alignItems: 'start',
                }}
              >
                <Box
                  sx={{ display: 'flex', flexDirection: 'column', gap: 'clamp(24px, 3vw, 48px)' }}
                >
                  <JoinHero code={code} joinHost={joinHost ?? ''} />
                  {heroFoot}
                </Box>
                <Box sx={{ minWidth: 0 }}>{children}</Box>
              </Box>
            ) : (
              children
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
