import { Box, Button, Container, Typography } from '@mui/material';
import { type ReactNode, useState } from 'react';
import { kraftBg } from './components/paper.js';
import { codeFromLocation, forgetJoinLink } from './joinLink.js';
import { HostScreen } from './screens/HostScreen.js';
import { PlayerScreen } from './screens/PlayerScreen.js';
import { JoinForm } from './screens/joinForm.js';
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
  | { mode: 'join'; linkedCode: string | null }
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

export function App(): ReactNode {
  // On load, resume a persisted host session (8.1) — a reloaded host re-attaches its
  // own room via `resumeHost` instead of dropping back to the landing.
  const [screen, setScreen] = useState<Screen>(() => {
    const resume = storedHostSession();
    if (resume !== null) {
      forgetJoinLink(); // the board wins; a /CODE in its address must not be read later
      return { mode: 'host', transport: createHostTransport('Host', resume) };
    }
    // UX-2: a /CODE (or ?code=) link opens the join form with the code filled in.
    const linkedCode = codeFromLocation(window.location);
    return linkedCode === null ? { mode: 'landing' } : { mode: 'join', linkedCode };
  });

  // Leaving a screen ends its link for good — no orphan socket left reconnecting (and
  // possibly re-joining a room code reused by strangers) behind the new screen.
  const leave = (next: Screen): void => {
    if (screen.mode === 'host' || screen.mode === 'player') {
      screen.transport.dispose();
    }
    setScreen(next);
  };

  const toLanding = (): void => {
    clearHostSession(); // a failed resume / closed room must not resume again
    forgetJoinLink();
    leave({ mode: 'landing' });
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
              onHost={() => {
                forgetJoinLink();
                setScreen({ mode: 'host', transport: createHostTransport('Host') });
              }}
              onJoin={() => setScreen({ mode: 'join', linkedCode: null })}
            />
          ) : (
            <JoinForm
              linkedCode={screen.linkedCode}
              onJoin={(code, name) =>
                setScreen({ mode: 'player', transport: createPlayerTransport(code, name) })
              }
              onBack={() => {
                forgetJoinLink();
                setScreen({ mode: 'landing' });
              }}
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
        <PlayerScreen
          transport={screen.transport}
          onExit={() => leave({ mode: 'join', linkedCode: null })}
        />
      )}
    </Box>
  );
}
