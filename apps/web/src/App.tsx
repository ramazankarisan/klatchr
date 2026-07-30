import { Box, Button, Container, TextField, Typography } from '@mui/material';
import { type ReactNode, useState } from 'react';
import { kraftBg } from './components/paper.js';
import { HostScreen } from './screens/HostScreen.js';
import { PlayerScreen } from './screens/PlayerScreen.js';
import { tokens } from './tokens.js';
import {
  clearHostSession,
  createHostTransport,
  createPlayerTransport,
  storedHostSession,
  storedNick,
} from './transport/factory.js';
import type { Transport } from './transport/types.js';

type Screen =
  | { mode: 'landing' }
  | { mode: 'join' }
  | { mode: 'host'; transport: Transport }
  | { mode: 'player'; transport: Transport };

const column = { display: 'flex', flexDirection: 'column' } as const;

function Landing({ onHost, onJoin }: { onHost: () => void; onJoin: () => void }): ReactNode {
  return (
    <Box sx={{ ...column, alignItems: 'flex-start', gap: 3 }}>
      <Typography variant="h1" sx={{ fontSize: { xs: 44, sm: 64 } }}>
        <Box component="span" sx={{ color: tokens.color.marker }}>
          K
        </Box>
        latchr
      </Typography>
      <Typography sx={{ fontSize: 19, color: tokens.color.inkSoft, maxWidth: '46ch' }}>
        Icebreaker games for the room. A host opens a board on the shared screen; everyone joins
        from their phone with a four-letter code.
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2 }}>
        <Button variant="contained" size="large" onClick={onHost}>
          Host a room
        </Button>
        <Button variant="outlined" size="large" color="inherit" onClick={onJoin}>
          Join a room
        </Button>
      </Box>
    </Box>
  );
}

function JoinForm({ onJoin }: { onJoin: (code: string, name: string) => void }): ReactNode {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  // F1: if this code has a saved session, a rejoin resumes it and keeps the old
  // name — say so rather than silently swallowing whatever they type now.
  const resuming = code.length === 4 ? storedNick(code) : null;
  return (
    <Box
      component="form"
      onSubmit={(e) => {
        e.preventDefault();
        onJoin(code, name.trim());
      }}
      sx={{ ...column, gap: 2.5, maxWidth: 360 }}
    >
      <Typography variant="h2" component="h1" sx={{ fontSize: 32 }}>
        Grab a name-tag
      </Typography>
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
      <TextField label="Your name" value={name} onChange={(e) => setName(e.target.value)} />
      {resuming !== null ? (
        <Typography sx={{ fontSize: 13, color: tokens.color.inkSoft }}>
          Resuming as{' '}
          <Box component="span" sx={{ fontWeight: 700, color: tokens.color.ink }}>
            {resuming}
          </Box>{' '}
          — your seat &amp; score are saved.
        </Typography>
      ) : null}
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

export function App(): ReactNode {
  // On load, resume a persisted host session (8.1) — a reloaded host re-attaches its
  // own room via `resumeHost` instead of dropping back to the landing.
  const [screen, setScreen] = useState<Screen>(() => {
    const resume = storedHostSession();
    return resume === null
      ? { mode: 'landing' }
      : { mode: 'host', transport: createHostTransport('Host', resume) };
  });

  const toLanding = (): void => {
    clearHostSession(); // a failed resume / closed room must not resume again
    setScreen({ mode: 'landing' });
  };

  // Landing/join are narrow forms (a phone-sized container); the host board and the
  // player surface own their own width and fill the viewport (8.2 — no `lg` cap that
  // shrank the board on a TV and pinned the player to a fake-phone column).
  if (screen.mode === 'landing' || screen.mode === 'join') {
    return (
      <Box sx={{ ...kraftBg, minHeight: '100dvh' }}>
        <Container maxWidth="sm" sx={{ py: { xs: 4, sm: 6 } }}>
          {screen.mode === 'landing' ? (
            <Landing
              onHost={() => setScreen({ mode: 'host', transport: createHostTransport('Host') })}
              onJoin={() => setScreen({ mode: 'join' })}
            />
          ) : (
            <JoinForm
              onJoin={(code, name) =>
                setScreen({ mode: 'player', transport: createPlayerTransport(code, name) })
              }
            />
          )}
        </Container>
      </Box>
    );
  }

  return (
    <Box sx={{ ...kraftBg, minHeight: '100dvh' }}>
      {screen.mode === 'host' ? (
        <Box sx={{ px: { xs: 2, sm: 3, md: 4 }, py: { xs: 3, sm: 5 } }}>
          <HostScreen transport={screen.transport} onExit={toLanding} />
        </Box>
      ) : (
        <PlayerScreen transport={screen.transport} onExit={() => setScreen({ mode: 'join' })} />
      )}
    </Box>
  );
}
