import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';
import type { ReactNode } from 'react';

/**
 * A confirm-before-you-act dialog for the host's destructive controls (Cycle 12, F7) —
 * End game, Change game, Leave & close room. Cancel is the safe default (autofocus); the
 * confirm button carries the action's weight (`danger` ⇒ red). `open={false}` renders nothing.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}): ReactNode {
  return (
    <Dialog open={open} onClose={onCancel} aria-labelledby="confirm-dialog-title">
      <DialogTitle id="confirm-dialog-title">{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{body}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} color="inherit" autoFocus>
          Cancel
        </Button>
        <Button onClick={onConfirm} variant="contained" color={danger ? 'error' : 'primary'}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

interface ConfirmSpec {
  title: string;
  body: string;
  confirmLabel: string;
  danger: boolean;
  action: () => void;
}

/** Copy + the action for each destructive host confirm (F7), or null when none is open. */
export function confirmDialogFor(
  kind: 'end' | 'change' | 'leave' | null,
  code: string,
  actions: { end: () => void; change: () => void; leave: () => void },
): ConfirmSpec | null {
  switch (kind) {
    case 'end':
      return {
        title: 'End this round?',
        body: 'This ends the current round and shows the standings.',
        confirmLabel: 'End game',
        danger: false,
        action: actions.end,
      };
    case 'change':
      return {
        title: 'Switch games?',
        body: 'Pick a different game. Your question setup for this game is kept.',
        confirmLabel: 'Change game',
        danger: false,
        action: actions.change,
      };
    case 'leave':
      return {
        title: 'Close the room?',
        body: `This ends the game and closes room ${code} for everyone. You'll go back to the start, where you can host again or join as a player.`,
        confirmLabel: 'Close room',
        danger: true,
        action: actions.leave,
      };
    case null:
      return null;
  }
}
