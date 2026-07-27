import { Box, Button, Container, TextField, Typography } from '@mui/material';
import { type ReactNode, useRef, useState } from 'react';
import { kraftBg } from './components/paper.js';
import { Stage } from './screens/Stage.js';
import { tokens } from './tokens.js';
import { MockEngine } from './transport/mockRoom.js';

type Mode = 'landing' | 'join' | 'stage';

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

function JoinForm({ onJoin }: { onJoin: () => void }): ReactNode {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  return (
    <Box
      component="form"
      onSubmit={(e) => {
        e.preventDefault();
        onJoin();
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
  const engineRef = useRef<MockEngine | null>(null);
  if (engineRef.current === null) {
    engineRef.current = new MockEngine();
  }
  const [mode, setMode] = useState<Mode>('landing');

  return (
    <Box sx={{ ...kraftBg, minHeight: '100vh' }}>
      <Container maxWidth="lg" sx={{ py: { xs: 4, sm: 6 } }}>
        {mode === 'landing' ? (
          <Landing onHost={() => setMode('stage')} onJoin={() => setMode('join')} />
        ) : mode === 'join' ? (
          <JoinForm onJoin={() => setMode('stage')} />
        ) : (
          <Stage engine={engineRef.current} />
        )}
      </Container>
    </Box>
  );
}
