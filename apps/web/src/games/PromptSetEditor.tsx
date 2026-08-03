import type { PromptPack } from '@klatchr/games';
import { Box, Button, IconButton, TextField, Typography } from '@mui/material';
import { type ReactNode, useState } from 'react';
import { tokens } from '../tokens.js';

/**
 * The host's question editor (Cycle 11), shared by every prompt-driven game — each game
 * supplies its own `packs`. One working list: tap a pack to pour its questions in (deduped,
 * mixable), delete any line, or type your own. The list bubbles up as plain strings via
 * `onChange`; the host screen sends it as `configureGame`. An empty list ⇒ the game's
 * built-in bank, so this is always optional. Source tags are informational, not a division.
 */

interface Item {
  text: string;
  source: string;
}

const norm = (s: string): string => s.trim().toLowerCase();

interface PromptSetEditorProps {
  packs: readonly PromptPack[];
  onChange: (prompts: string[]) => void;
}

export function PromptSetEditor({ packs, onChange }: PromptSetEditorProps): ReactNode {
  const [items, setItems] = useState<readonly Item[]>([]);
  const [draft, setDraft] = useState('');

  const has = (text: string): boolean => items.some((i) => norm(i.text) === norm(text));

  const commit = (next: readonly Item[]): void => {
    setItems(next);
    onChange(next.map((i) => i.text));
  };

  const addPack = (pack: PromptPack): void => {
    const additions = pack.prompts
      .filter((p) => p.trim().length > 0 && !has(p))
      .map((text) => ({ text, source: pack.name }));
    if (additions.length > 0) {
      commit([...items, ...additions]);
    }
  };

  const remove = (index: number): void => {
    commit(items.filter((_, i) => i !== index));
  };

  const addCustom = (): void => {
    const text = draft.trim();
    setDraft('');
    if (text.length > 0 && !has(text)) {
      commit([...items, { text, source: 'yours' }]);
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1.75,
        backgroundColor: tokens.color.card,
        border: '1px solid #e6d6bd',
        borderRadius: `${tokens.radius.control}px`,
        p: 2,
      }}
    >
      <Box>
        <Eyebrow>Pour in a pack</Eyebrow>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
          {packs.map((pack) => {
            const added = pack.prompts.every((p) => has(p));
            return (
              <Button
                key={pack.id}
                onClick={() => addPack(pack)}
                sx={{
                  textTransform: 'none',
                  minHeight: 44,
                  borderRadius: 999,
                  px: 1.75,
                  fontWeight: 700,
                  fontSize: 13,
                  border: `1.5px solid ${added ? tokens.color.teal : tokens.color.markerDeep}`,
                  color: added ? '#fff' : tokens.color.markerDeep,
                  backgroundColor: added ? tokens.color.teal : 'transparent',
                  '&:hover': { backgroundColor: added ? tokens.color.teal : undefined },
                }}
              >
                {added ? '✓' : '＋'}&nbsp;{pack.name}
              </Button>
            );
          })}
        </Box>
      </Box>

      <Box>
        <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Eyebrow>Your list</Eyebrow>
          <Typography sx={{ color: tokens.color.inkSoft, fontSize: 13 }}>
            {items.length} {items.length === 1 ? 'question' : 'questions'}
          </Typography>
        </Box>
        {items.length > 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
            {items.map((item, i) => (
              <Box
                key={item.text} // deduped on entry, so text is a unique, stable key
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  backgroundColor: '#fff',
                  border: '1px solid #e6d9c1',
                  borderLeft: `4px solid ${tokens.color.kraft2}`,
                  borderRadius: `${tokens.radius.card}px`,
                  px: 1.25,
                  py: 1,
                }}
              >
                <Typography
                  sx={{ fontFamily: tokens.font.mono, fontSize: 12, color: tokens.color.inkSoft }}
                >
                  {i + 1}
                </Typography>
                <Typography sx={{ flex: 1, fontSize: 14 }}>{item.text}</Typography>
                <Typography
                  sx={{
                    fontFamily: tokens.font.mono,
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: tokens.color.inkSoft,
                  }}
                >
                  {item.source}
                </Typography>
                <IconButton
                  aria-label={`Remove “${item.text}”`}
                  onClick={() => remove(i)}
                  sx={{ color: tokens.color.markerDeep, width: 44, height: 44 }}
                >
                  ×
                </IconButton>
              </Box>
            ))}
          </Box>
        ) : null}
      </Box>

      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <TextField
          label="Type a question of your own"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addCustom();
            }
          }}
          size="small"
          fullWidth
        />
        <Button variant="contained" onClick={addCustom} sx={{ minHeight: 40 }}>
          Add
        </Button>
      </Box>

      <Typography sx={{ color: tokens.color.inkSoft, fontSize: 12.5 }}>
        {items.length === 0
          ? 'Empty — the game plays its built-in questions.'
          : 'Asked in order — every question comes up before any repeats.'}
      </Typography>
    </Box>
  );
}

function Eyebrow({ children }: { children: ReactNode }): ReactNode {
  return (
    <Typography
      sx={{
        fontFamily: tokens.font.body,
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: '0.07em',
        fontSize: 11,
        color: tokens.color.markerDeep,
      }}
    >
      {children}
    </Typography>
  );
}
