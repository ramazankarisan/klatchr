import { Box, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { tokens } from '../tokens.js';

// Warm paper grain: fractal noise, desaturated so it reads as tooth in the
// stock rather than colored static, at an opacity you can actually see.
const grain =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.3'/%3E%3C/svg%3E\")";

export const kraftBg = { backgroundColor: tokens.color.kraft, backgroundImage: grain } as const;

/** Room code on label-maker (dymo) tape. */
export function DymoCode({ code, small }: { code: string; small?: boolean }): ReactNode {
  return (
    <Box
      component="span"
      aria-label={`room code ${code}`}
      sx={{
        fontFamily: tokens.font.mono,
        fontWeight: 700,
        letterSpacing: '0.24em',
        fontSize: small ? 13 : { xs: 24, sm: 34 },
        color: '#f3ece0',
        backgroundColor: tokens.color.dymo,
        px: small ? 1 : 2,
        py: small ? 0.4 : 0.75,
        borderRadius: 1,
        display: 'inline-block',
      }}
    >
      {code}
    </Box>
  );
}

/** A hand-lettered name-tag sticker in the player's marker color. */
export function NameTag({
  name,
  color,
  band = 'Hello, I’m',
  answered,
}: {
  name: string;
  color: string;
  band?: string;
  answered?: boolean;
}): ReactNode {
  return (
    <Box
      sx={{
        backgroundColor: tokens.color.card,
        borderRadius: `${tokens.radius.control}px`,
        overflow: 'hidden',
        boxShadow: '1px 2px 5px rgba(43,38,32,0.14)',
        border: '1px solid #ece2d0',
      }}
    >
      <Box sx={{ height: 6, backgroundColor: color }} />
      <Box
        sx={{
          fontFamily: tokens.font.hand,
          fontSize: 17,
          px: 1,
          pt: 0.75,
          pb: 1,
          color: tokens.color.ink,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 0.75,
        }}
      >
        <Box component="span">{name}</Box>
        {answered ? (
          <Box
            component="span"
            sx={{
              color: tokens.color.teal,
              fontFamily: tokens.font.body,
              fontWeight: 800,
              fontSize: 12,
            }}
          >
            ✓
          </Box>
        ) : null}
      </Box>
      <Box sx={{ display: 'none' }}>{band}</Box>
    </Box>
  );
}

/** An index card taped to the board: answer text, optional revealed author. */
export function IndexCard({ children }: { children: ReactNode }): ReactNode {
  return (
    <Box
      sx={{
        position: 'relative',
        backgroundColor: tokens.color.card,
        borderRadius: `${tokens.radius.card}px`,
        p: '22px 18px 16px',
        boxShadow: '1px 4px 10px rgba(43,38,32,0.16)',
        backgroundImage: 'repeating-linear-gradient(#FBF6EC 0 27px, #e7dcc6 27px 28px)',
        border: '1px solid #ece2d0',
        minHeight: 108,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          top: -9,
          left: '50%',
          width: 62,
          height: 18,
          transform: 'translateX(-50%) rotate(-3deg)',
          backgroundColor: 'rgba(233,216,180,0.72)',
        }}
      />
      {children}
    </Box>
  );
}

/** The teal "Said it" rubber stamp — shown only at reveal. */
export function Stamp(): ReactNode {
  return (
    <Box
      component="span"
      sx={{
        alignSelf: 'flex-start',
        fontFamily: tokens.font.display,
        fontWeight: 900,
        fontSize: 12,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: tokens.color.teal,
        border: `2.5px solid ${tokens.color.teal}`,
        borderRadius: 1,
        px: 1,
        py: 0.25,
        transform: 'rotate(-6deg)',
      }}
    >
      Said it
    </Box>
  );
}

/** The host shared-screen board: a top bar with the room code, then content. */
export function Board({
  code,
  hint,
  children,
}: { code: string; hint?: ReactNode; children: ReactNode }): ReactNode {
  return (
    <Box
      sx={{
        ...kraftBg,
        border: `1px solid ${tokens.color.kraft2}`,
        borderRadius: 2,
        overflow: 'hidden',
        boxShadow: '0 22px 50px -30px rgba(43,38,32,0.5)',
        color: tokens.color.ink,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          p: '16px 24px',
          borderBottom: `2px dashed ${tokens.color.kraft2}`,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography variant="overline" sx={{ color: tokens.color.inkSoft }}>
            Room
          </Typography>
          <DymoCode code={code} />
        </Box>
        {hint ? (
          <Typography sx={{ fontSize: 13, color: tokens.color.inkSoft, textAlign: 'right' }}>
            {hint}
          </Typography>
        ) : null}
      </Box>
      <Box sx={{ p: '28px' }}>{children}</Box>
    </Box>
  );
}

/** A phone frame wrapping a portrait player screen. */
export function Phone({ children }: { children: ReactNode }): ReactNode {
  return (
    <Box
      sx={{
        width: 300,
        flex: '0 0 auto',
        backgroundColor: '#ded2bd',
        borderRadius: '30px',
        p: '11px',
        boxShadow: '0 22px 46px -26px rgba(43,38,32,0.6)',
      }}
    >
      <Box
        sx={{
          ...kraftBg,
          borderRadius: '22px',
          p: '18px 16px 20px',
          minHeight: 500,
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
          color: tokens.color.ink,
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
