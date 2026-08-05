import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MAX_PROMPTS, MAX_PROMPT_LEN, type PromptPack } from '@klatchr/games';
import { Box, Button, IconButton, TextField, Typography } from '@mui/material';
import { type ReactNode, useState } from 'react';
import { tokens } from '../tokens.js';

/**
 * The host's question editor (Cycle 11, reworked Cycle 12), shared by every prompt-driven
 * game — each game supplies its own `packs`. One working list: tap a pack to pour its
 * questions in, tap it again to take them out (toggle); drag a row's handle to reorder (the
 * list order is the ask order); delete any line, or type your own. The list bubbles up as
 * plain strings via `onChange`; the host screen sends it as `configureGame` and caches it.
 * An empty list ⇒ the game's built-in bank.
 */

interface Item {
  text: string;
  source: string;
}

const norm = (s: string): string => s.trim().toLowerCase();

/** Reorder `items` by moving the row keyed `activeId` to where `overId` sits (drag result).
 * Pure + exported so the reorder is unit-testable without a real drag in jsdom. */
export function reorderByText(items: readonly Item[], activeId: string, overId: string): Item[] {
  const from = items.findIndex((i) => i.text === activeId);
  const to = items.findIndex((i) => i.text === overId);
  return from === -1 || to === -1 ? [...items] : arrayMove([...items], from, to);
}

interface PromptSetEditorProps {
  packs: readonly PromptPack[];
  onChange: (prompts: string[]) => void;
  // A previously-authored list (from the client cache) to rehydrate on mount — so a reload
  // or a re-opened panel shows the real set instead of an empty "built-in" one (F1, Cycle 11).
  initial?: readonly string[];
}

export function PromptSetEditor({
  packs,
  onChange,
  initial = [],
}: PromptSetEditorProps): ReactNode {
  const [items, setItems] = useState<readonly Item[]>(() =>
    initial.map((text) => ({ text, source: 'saved' })),
  );
  const [draft, setDraft] = useState('');
  const full = items.length >= MAX_PROMPTS;
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const has = (text: string): boolean => items.some((i) => norm(i.text) === norm(text));

  const commit = (next: readonly Item[]): void => {
    const capped = next.slice(0, MAX_PROMPTS); // never show more than the game will play (F3)
    setItems(capped);
    onChange(capped.map((i) => i.text));
  };

  // F1: a pack toggles — if all its questions are already in the list, tapping removes exactly
  // them; otherwise it appends the ones not already there.
  const togglePack = (pack: PromptPack): void => {
    if (pack.prompts.every((p) => has(p))) {
      const inPack = new Set(pack.prompts.map(norm));
      commit(items.filter((i) => !inPack.has(norm(i.text))));
      return;
    }
    const additions = pack.prompts
      .filter((p) => p.trim().length > 0 && !has(p))
      .map((text) => ({ text, source: pack.name }));
    commit([...items, ...additions]);
  };

  const remove = (index: number): void => commit(items.filter((_, i) => i !== index));

  const addCustom = (): void => {
    const text = draft.trim().slice(0, MAX_PROMPT_LEN);
    setDraft('');
    if (text.length > 0 && !has(text) && !full) {
      commit([...items, { text, source: 'yours' }]);
    }
  };

  const onDragEnd = (e: DragEndEvent): void => {
    const { active, over } = e;
    if (over !== null && active.id !== over.id) {
      commit(reorderByText(items, String(active.id), String(over.id)));
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
        <Eyebrow>Pour in a pack — tap again to remove</Eyebrow>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
          {packs.map((pack) => {
            const added = pack.prompts.every((p) => has(p));
            return (
              <Button
                key={pack.id}
                onClick={() => togglePack(pack)}
                aria-pressed={added}
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
          <Eyebrow>Your list · drag to reorder</Eyebrow>
          <Typography sx={{ color: tokens.color.inkSoft, fontSize: 13 }}>
            {items.length} {items.length === 1 ? 'question' : 'questions'}
          </Typography>
        </Box>
        {items.length > 0 ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext
              items={items.map((i) => i.text)}
              strategy={verticalListSortingStrategy}
            >
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
                {items.map((item, i) => (
                  <SortableRow key={item.text} item={item} index={i} onRemove={() => remove(i)} />
                ))}
              </Box>
            </SortableContext>
          </DndContext>
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
          disabled={full}
          slotProps={{ htmlInput: { maxLength: MAX_PROMPT_LEN } }}
          size="small"
          fullWidth
        />
        <Button variant="contained" onClick={addCustom} disabled={full} sx={{ minHeight: 40 }}>
          Add
        </Button>
      </Box>

      <Typography sx={{ color: tokens.color.inkSoft, fontSize: 12.5 }}>
        {items.length === 0
          ? 'Empty — the game plays its built-in questions.'
          : full
            ? `That's the max of ${MAX_PROMPTS} questions.`
            : `Played in this order, one per round · ${items.length} ${items.length === 1 ? 'round' : 'rounds'}, then the game ends.`}
      </Typography>
    </Box>
  );
}

function SortableRow({
  item,
  index,
  onRemove,
}: { item: Item; index: number; onRemove: () => void }): ReactNode {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.text,
  });
  return (
    <Box
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        backgroundColor: '#fff',
        border: '1px solid #e6d9c1',
        borderLeft: `4px solid ${isDragging ? tokens.color.marker : tokens.color.kraft2}`,
        borderRadius: `${tokens.radius.card}px`,
        px: 1,
        py: 1,
        boxShadow: isDragging ? '0 8px 18px -6px rgba(43,38,32,.4)' : 'none',
      }}
    >
      <Box
        component="span"
        aria-label={`Reorder “${item.text}”`}
        {...attributes}
        {...listeners}
        sx={{
          cursor: 'grab',
          color: tokens.color.inkSoft,
          fontSize: 16,
          lineHeight: 1,
          px: 0.5,
          touchAction: 'none',
        }}
      >
        ⠿
      </Box>
      <Typography sx={{ fontFamily: tokens.font.mono, fontSize: 12, color: tokens.color.inkSoft }}>
        {index + 1}
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
        onClick={onRemove}
        sx={{ color: tokens.color.markerDeep, width: 44, height: 44 }}
      >
        ×
      </IconButton>
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
