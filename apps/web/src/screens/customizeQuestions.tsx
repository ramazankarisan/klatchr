import type { PromptPack } from '@klatchr/games';
import { Box, Button } from '@mui/material';
import { type ReactNode, useEffect, useState } from 'react';
import { PromptSetEditor } from '../games/PromptSetEditor.js';
import { tokens } from '../tokens.js';
import { rememberQuestions, storedQuestions } from '../transport/factory.js';

/**
 * The optional "Customize questions" disclosure under the picked game (Cycle 11). Closed by
 * default — the one-tap path is untouched. Open it to pour in packs, delete, reorder, or add
 * your own; the working list is sent up as it changes and cached client-side. Self-contained:
 * the host screen remounts it with a `key` on the game id, so a game change resets it. The
 * editor stays mounted while collapsed (hidden), so opening and closing never loses the list.
 * It reports "open with an empty list" up (F3) so the host screen can block Start.
 */
export function CustomizeQuestions({
  code,
  gameId,
  packs,
  onConfigure,
  onBlockedChange,
}: {
  code: string;
  gameId: string;
  packs: readonly PromptPack[];
  onConfigure: (prompts: string[]) => void;
  onBlockedChange: (blocked: boolean) => void;
}): ReactNode {
  // Rehydrate from the client cache so a reload or re-opened panel shows the real set (F1).
  const [initial] = useState(() => storedQuestions(code, gameId));
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(initial.length);
  useEffect(() => {
    onBlockedChange(open && count === 0);
    // Reset on unmount (e.g. switching to a game with no packs) so a stale "blocked" can't
    // leave Start disabled with no editor left to clear it.
    return () => onBlockedChange(false);
  }, [open, count, onBlockedChange]);
  return (
    <Box sx={{ mt: 2.5 }}>
      <Button
        onClick={() => setOpen((v) => !v)}
        fullWidth
        sx={{
          textTransform: 'none',
          justifyContent: 'space-between',
          color: tokens.color.ink,
          backgroundColor: tokens.color.card,
          border: '1px dashed #d8c8ac',
          borderRadius: `${tokens.radius.control}px`,
          px: 1.75,
          py: 1.25,
          fontSize: 14,
        }}
      >
        <Box component="span">
          {count === 0
            ? 'Using the built-in question bank'
            : `${count} custom ${count === 1 ? 'question' : 'questions'}`}
        </Box>
        <Box component="span" sx={{ color: tokens.color.inkSoft, fontWeight: 700 }}>
          {open ? 'Done ▴' : 'Customize ▾'}
        </Box>
      </Button>
      <Box sx={{ mt: 1, display: open ? 'block' : 'none' }}>
        <PromptSetEditor
          packs={packs}
          initial={initial}
          onChange={(next) => {
            setCount(next.length);
            rememberQuestions(code, gameId, next);
            onConfigure(next);
          }}
        />
      </Box>
    </Box>
  );
}
