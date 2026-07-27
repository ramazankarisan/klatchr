import { Box, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { tokens } from '../tokens.js';
import type { MockEngine } from '../transport/mockRoom.js';
import { useFrame } from '../useFrame.js';
import { HostScreen } from './HostScreen.js';
import { PlayerScreen } from './PlayerScreen.js';

/**
 * The single-browser walkthrough: the host board plus every player's phone,
 * all reading real redacted frames from the one mock engine. The host's button
 * drives the round; the phones react.
 */
export function Stage({ engine }: { engine: MockEngine }): ReactNode {
  const frame = useFrame(engine, 'host');
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Box>
        <Typography variant="overline" sx={{ color: tokens.color.markerDeep }}>
          Host · shared screen
        </Typography>
        <HostScreen engine={engine} />
      </Box>
      <Box>
        <Typography variant="overline" sx={{ color: tokens.color.markerDeep }}>
          Player · phones
        </Typography>
        <Box sx={{ display: 'flex', gap: 2.5, overflowX: 'auto', pb: 2 }}>
          {frame.players.map((p) => (
            <PlayerScreen key={p.id} engine={engine} id={p.id} />
          ))}
        </Box>
      </Box>
    </Box>
  );
}
