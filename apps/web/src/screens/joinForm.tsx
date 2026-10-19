import { Box, Button, TextField, Typography } from '@mui/material';
import { type ReactNode, useState } from 'react';
import { forgetJoinLink } from '../joinLink.js';
import { tokens } from '../tokens.js';
import { storedNick } from '../transport/factory.js';

const column = { display: 'flex', flexDirection: 'column' } as const;

function BackChevron(): ReactNode {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

/** "Joining room CODE · Not this room?" (UX-2) — the code a link brought, with a way out. */
function LinkedRoom({ code, onClear }: { code: string; onClear: () => void }): ReactNode {
  return (
    <Box
      component="section"
      aria-label={`Joining room ${code}`}
      sx={{
        backgroundColor: tokens.color.card,
        borderRadius: `${tokens.radius.control}px`,
        p: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 1.5,
        boxShadow: tokens.elevation.lift,
      }}
    >
      <Box sx={{ ...column, gap: 0.25 }}>
        <Typography sx={{ fontSize: 14, color: tokens.color.inkSoft }}>Joining room</Typography>
        <Typography
          sx={{
            fontFamily: tokens.font.mono,
            fontWeight: 700,
            fontSize: 28,
            letterSpacing: '0.12em',
          }}
        >
          {code}
        </Typography>
      </Box>
      <Button
        variant="text"
        onClick={onClear}
        sx={{ minHeight: 44, textTransform: 'none', fontSize: 16, color: tokens.color.markerDeep }}
      >
        Not this room?
      </Button>
    </Box>
  );
}

/**
 * The phone's join form. A `/<CODE>` or `?code=` link (UX-2) arrives as `linkedCode`: the
 * code is filled in and shown on a card, focus starts on the name, and "Not this room?"
 * clears it back to a typed code. Back returns to the landing.
 */
export function JoinForm({
  linkedCode,
  onJoin,
  onBack,
}: {
  linkedCode: string | null;
  onJoin: (code: string, name: string) => void;
  onBack: () => void;
}): ReactNode {
  const [linked, setLinked] = useState(linkedCode);
  const [code, setCode] = useState(linkedCode ?? '');
  const [name, setName] = useState('');
  // F1: if this code has a saved session, a rejoin resumes it and keeps the old
  // name — say so rather than silently swallowing whatever they type now.
  const resuming = code.length === 4 ? storedNick(code) : null;
  return (
    <Box
      component="form"
      onSubmit={(e) => {
        e.preventDefault();
        forgetJoinLink();
        onJoin(code, name.trim());
      }}
      sx={{ ...column, gap: 2.5, maxWidth: 360 }}
    >
      <Button
        variant="text"
        color="inherit"
        onClick={onBack}
        startIcon={<BackChevron />}
        sx={{ alignSelf: 'flex-start', minHeight: 44, textTransform: 'none', fontSize: 17, px: 1 }}
      >
        Back
      </Button>
      <Typography variant="h2" component="h1" sx={{ fontSize: 32 }}>
        Grab a name-tag
      </Typography>
      {linked !== null ? (
        <LinkedRoom
          code={linked}
          onClear={() => {
            forgetJoinLink();
            setLinked(null);
            setCode(''); // the code field mounts now, and takes focus (autoFocus)
          }}
        />
      ) : (
        <TextField
          label="Room code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          autoFocus
          slotProps={{
            htmlInput: {
              maxLength: 4,
              autoCapitalize: 'characters',
              autoComplete: 'off',
              autoCorrect: 'off',
              spellCheck: false,
              inputMode: 'text',
            },
          }}
        />
      )}
      <TextField
        label="Your name"
        placeholder="What should the room call you?"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus={linked !== null}
        // The protocol bound: a pasted long name is trimmed here, not refused by the
        // server (which then caps it to 20 visible characters without splitting emoji).
        slotProps={{ htmlInput: { maxLength: 100, autoComplete: 'nickname' } }}
      />
      {resuming !== null ? (
        <Typography sx={{ fontSize: 13, color: tokens.color.inkSoft }}>
          Resuming as{' '}
          <Box component="span" sx={{ fontWeight: 700, color: tokens.color.ink }}>
            {resuming}
          </Box>{' '}
          — your seat &amp; score are saved.
        </Typography>
      ) : (
        <Typography sx={{ fontSize: 15, color: tokens.color.inkSoft, lineHeight: 1.4 }}>
          The host’s screen shows the code. Opened a link? It’s filled in for you.
        </Typography>
      )}
      <Button
        type="submit"
        variant="contained"
        size="large"
        disabled={code.length < 4 || name.trim() === ''}
      >
        Join the room
      </Button>
    </Box>
  );
}
