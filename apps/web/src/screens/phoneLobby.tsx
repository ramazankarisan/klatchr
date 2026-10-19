import { Box, Button, Typography } from '@mui/material';
import { type ReactNode, useState } from 'react';
import { ConfirmDialog } from '../components/confirmDialog.js';
import { PhoneHowTo } from '../games/howTo.js';
import type { GameOption } from '../games/registry.js';
import { PlayerDot } from '../games/viewKit.js';
import { tokens } from '../tokens.js';
import type { PublicPlayer } from '../transport/types.js';

/** Your own name-tag: your marker colour and your name, display bold. */
function NameTag({
  id,
  name,
  players,
}: { id: string; name: string; players: readonly PublicPlayer[] }): ReactNode {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        backgroundColor: tokens.color.card,
        borderRadius: `${tokens.radius.control}px`,
        p: '8px 14px',
        fontFamily: tokens.font.display,
        fontWeight: 800,
        fontSize: 18,
        boxShadow: tokens.elevation.lift,
        minWidth: 0,
        overflowWrap: 'anywhere',
      }}
    >
      <PlayerDot id={id} players={players} size={14} border />
      {name}
    </Box>
  );
}

/**
 * The phone waiting room (UX-2): your name-tag and a way out, what's up next and how it
 * plays, who's in the room, and a note that the phone can sleep. Leaving confirms first,
 * then the caller sends `leave` and goes back to the join form.
 */
export function PhoneLobby({
  code,
  youId,
  players,
  game,
  onLeave,
}: {
  code: string;
  youId: string;
  players: readonly PublicPlayer[];
  game: GameOption | undefined;
  onLeave: () => void;
}): ReactNode {
  const [confirming, setConfirming] = useState(false);
  const me = players.find((p) => p.id === youId);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.25, flex: 1 }}>
      <Box
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}
      >
        <NameTag id={youId} name={me?.nickname ?? 'You'} players={players} />
        <Button
          variant="outlined"
          color="inherit"
          onClick={() => setConfirming(true)}
          sx={{
            minHeight: 44,
            flex: '0 0 auto',
            textTransform: 'none',
            fontSize: 15,
            color: tokens.color.inkSoft,
            borderColor: tokens.color.inkFaint,
          }}
        >
          Leave room
        </Button>
      </Box>
      <Typography variant="h2" sx={{ fontSize: 30, lineHeight: 1.1 }}>
        You’re in! Waiting for the host to start.
      </Typography>
      {game !== undefined && game.howTo.length > 0 ? (
        <PhoneHowTo game={game} />
      ) : (
        <Typography sx={{ fontSize: 16, color: tokens.color.inkSoft }}>
          The host is picking a game.
        </Typography>
      )}
      <Box
        component="section"
        aria-label="In the room"
        sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}
      >
        <Typography sx={{ fontSize: 16, fontWeight: 700 }}>
          In the room ({players.length})
        </Typography>
        <Box
          component="ul"
          sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, m: 0, p: 0, listStyle: 'none' }}
        >
          {players.map((p) => (
            <Box
              component="li"
              key={p.id}
              sx={{
                backgroundColor: tokens.color.card,
                borderRadius: `${tokens.radius.control}px`,
                p: '8px 12px',
                fontFamily: tokens.font.display,
                fontWeight: 800,
                fontSize: 16,
              }}
            >
              {p.nickname}
              {p.id === youId ? ' (you)' : ''}
            </Box>
          ))}
        </Box>
      </Box>
      <Typography
        sx={{ mt: 'auto', textAlign: 'center', fontSize: 15, color: tokens.color.inkSoft }}
      >
        Keep this page open — you can lock your phone; your seat waits 3 minutes.
      </Typography>
      <ConfirmDialog
        open={confirming}
        title="Leave the room?"
        body={`You’ll give up your seat in room ${code}. You can join again with the code.`}
        confirmLabel="Leave room"
        danger
        onConfirm={() => {
          setConfirming(false);
          onLeave();
        }}
        onCancel={() => setConfirming(false)}
      />
    </Box>
  );
}
