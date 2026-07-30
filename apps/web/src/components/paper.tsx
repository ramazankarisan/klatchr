import { Box, Button, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { tokens } from '../tokens.js';

// Warm paper grain: fractal noise, desaturated so it reads as tooth in the
// stock rather than colored static, at an opacity you can actually see.
const grain =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.3'/%3E%3C/svg%3E\")";

export const kraftBg = { backgroundColor: tokens.color.kraft, backgroundImage: grain } as const;

// While the socket heals (7.2) the surface behind the tape dims, so nobody reads a
// stale state as live and stray taps don't land mid-drop (they queue in the transport).
const dimWhileReconnecting = {
  opacity: 0.5,
  filter: 'saturate(0.85)',
  pointerEvents: 'none',
  transition: 'opacity 0.3s',
} as const;

/**
 * Masking-tape "Reconnecting…" strip clamped to the top of a surface while the
 * socket reconnects (7.2, design option A). Rendered as an `<output>` (implicit
 * role `status`, polite live region) so assistive tech announces it and tests
 * find it by role/text.
 */
function ReconnectingTape(): ReactNode {
  return (
    <Box
      component="output"
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        py: 1,
        px: 1.5,
        fontFamily: tokens.font.mono,
        fontWeight: 700,
        fontSize: 13,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: tokens.color.markerDeep,
        backgroundColor: tokens.color.card,
        backgroundImage:
          'repeating-linear-gradient(45deg, rgba(232,98,61,0.16) 0 12px, rgba(232,98,61,0.26) 12px 24px)',
        borderBottom: '1px solid rgba(193,74,43,0.35)',
        boxShadow: '0 3px 8px rgba(43,38,32,0.16)',
        '@keyframes klatchrPulse': {
          '0%,100%': { opacity: 1, transform: 'scale(1)' },
          '50%': { opacity: 0.35, transform: 'scale(0.7)' },
        },
      }}
    >
      <Box
        component="span"
        aria-hidden
        sx={{
          width: 9,
          height: 9,
          borderRadius: '50%',
          backgroundColor: tokens.color.marker,
          animation: 'klatchrPulse 1.1s ease-in-out infinite',
        }}
      />
      Reconnecting…
    </Box>
  );
}

// Take an element out of the visual flow but keep it for assistive tech — the
// standard clip-rect technique, used for each surface's single page `<h1>` (8.2 a11y).
const srOnly = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

/** The one visually-hidden `<h1>` a surface owns, so every screen has exactly one
 * top-level heading without a giant title competing with the design (8.2 a11y). */
function ScreenTitle({ children }: { children: ReactNode }): ReactNode {
  return (
    <Box component="h1" sx={srOnly}>
      {children}
    </Box>
  );
}

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
        fontSize: small ? 13 : { xs: 24, sm: 34, md: 42 },
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

/** A name-tag sticker in the player's marker color. Names use `font.display`
 * bold (8.2, design option B) — crisp and download-free, never the Comic Sans
 * fallback the old `font.hand` reached for on most phones. */
export function NameTag({ name, color }: { name: string; color: string }): ReactNode {
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
          fontFamily: tokens.font.display,
          fontWeight: 800,
          fontSize: 17,
          px: 1,
          pt: 0.75,
          pb: 1,
          color: tokens.color.ink,
        }}
      >
        {name}
      </Box>
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

/**
 * The full-screen recover card (8.1, design option A): a dead-end error —
 * bad code, full room, closed room, failed host-rejoin — becomes a clear message
 * plus a way back, instead of an endless spinner. Rendered inside a `Phone`/`Board`.
 */
export function Recover({
  title,
  body,
  actionLabel,
  onAction,
}: { title: string; body: string; actionLabel: string; onAction: () => void }): ReactNode {
  return (
    <Box
      role="alert"
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 1.5,
        py: 4,
      }}
    >
      <Box
        aria-hidden
        sx={{
          width: 52,
          height: 52,
          borderRadius: '50%',
          border: `2px solid ${tokens.color.bad}`,
          backgroundColor: 'rgba(192,57,43,0.12)',
          color: tokens.color.bad,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 26,
          fontWeight: 800,
        }}
      >
        !
      </Box>
      <Typography variant="h3" sx={{ fontSize: 22 }}>
        {title}
      </Typography>
      <Typography sx={{ color: tokens.color.inkSoft, fontSize: 14, maxWidth: '28ch' }}>
        {body}
      </Typography>
      <Button variant="contained" size="large" sx={{ mt: 1 }} onClick={onAction}>
        {actionLabel}
      </Button>
    </Box>
  );
}

/** The host shared-screen board (8.2): its own wide, centered container so it
 * fills a TV/projector — not the phone-sized `lg` cap it used to inherit — with a
 * projector-scale room code and a generous content pad. A top bar carries the code
 * and join hint; the game's board sits below. */
export function Board({
  code,
  hint,
  children,
  reconnecting,
}: { code: string; hint?: ReactNode; children: ReactNode; reconnecting?: boolean }): ReactNode {
  return (
    <Box sx={{ width: '100%', maxWidth: 1280, mx: 'auto' }}>
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
        <ScreenTitle>Klatchr — host board</ScreenTitle>
        {reconnecting ? <ReconnectingTape /> : null}
        <Box sx={reconnecting ? dimWhileReconnecting : undefined}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 2,
              p: { xs: '16px 24px', md: '20px 40px' },
              borderBottom: `2px dashed ${tokens.color.kraft2}`,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1.5, md: 2.5 } }}>
              <Typography variant="overline" sx={{ color: tokens.color.inkSoft }}>
                Room
              </Typography>
              <DymoCode code={code} />
            </Box>
            {hint ? (
              <Typography
                sx={{
                  fontSize: { xs: 13, md: 16 },
                  color: tokens.color.inkSoft,
                  textAlign: 'right',
                }}
              >
                {hint}
              </Typography>
            ) : null}
          </Box>
          <Box sx={{ p: { xs: '24px', md: '40px' } }}>{children}</Box>
        </Box>
      </Box>
    </Box>
  );
}

/** The player surface (8.2): full-viewport, not a fake phone. The mockup bezel is
 * retired from production — a real phone doesn't need a phone drawn inside it. It's a
 * fluid column capped at a comfortable reading width, centered, filling the viewport
 * height so the primary action stays thumb-reachable. The kraft ground comes from the
 * app root behind it. The `Phone`/`Board` bezels live on only in the design mockups. */
export function Phone({
  children,
  reconnecting,
}: { children: ReactNode; reconnecting?: boolean }): ReactNode {
  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: 480,
        mx: 'auto',
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        color: tokens.color.ink,
      }}
    >
      <ScreenTitle>Klatchr</ScreenTitle>
      {reconnecting ? <ReconnectingTape /> : null}
      <Box
        sx={{
          p: { xs: '20px 18px 28px', sm: '24px 22px 32px' },
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
          flex: 1,
          ...(reconnecting ? dimWhileReconnecting : {}),
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
