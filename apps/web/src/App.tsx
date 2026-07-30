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
  return (
    <Box
      component="form"
      onSubmit={(e) => {
        e.preventDefault();
        onJoin(code, name.trim());
      }}
      sx={{ ...column, gap: 2.5, maxWidth: 360 }}
    >
      <Typography variant="h2" sx={{ fontSize: 32 }}>
        Grab a name-tag
      </Typography>
      <TextField
        label="Room code"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        slotProps={{ htmlInput: { maxLength: 4 } }}
      />
      <TextField label="Your name" value={name} onChange={(e) => setName(e.target.value)} />
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

  return (
    <Box sx={{ ...kraftBg, minHeight: '100vh' }}>
      <Container maxWidth="lg" sx={{ py: { xs: 4, sm: 6 } }}>
        {screen.mode === 'landing' ? (
          <Landing
            onHost={() => setScreen({ mode: 'host', transport: createHostTransport('Host') })}
            onJoin={() => setScreen({ mode: 'join' })}
          />
        ) : screen.mode === 'join' ? (
          <JoinForm
            onJoin={(code, name) =>
              setScreen({ mode: 'player', transport: createPlayerTransport(code, name) })
            }
          />
        ) : screen.mode === 'host' ? (
          <HostScreen transport={screen.transport} onExit={toLanding} />
        ) : (
          <PlayerScreen transport={screen.transport} onExit={() => setScreen({ mode: 'join' })} />
        )}
      </Container>
    </Box>
  );
}
