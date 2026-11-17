/**
 * What happened when the trainer tried to put a backup file outside the app:
 * - `shared`: the share sheet finished (iOS "Save to Files", WhatsApp to self, mail…);
 * - `saved`: a save-file picker wrote and closed the file;
 * - `downloaded`: an `<a download>` was clicked; the browser gives no proof the file landed;
 * - `cancelled`: the trainer closed the sheet/picker;
 * - `failed`: nothing worked.
 */
export type SaveOutcome = 'shared' | 'saved' | 'downloaded' | 'cancelled' | 'failed';

/** A download has no completion signal: ask "did the file save?" before counting it. */
export function needsSaveConfirmation(outcome: SaveOutcome): boolean {
  return outcome === 'downloaded';
}

/**
 * Only a finished share/save, or a download the trainer confirmed, resets the weekly reminder or allows a
 * destructive step that depends on the file.
 */
export function shouldRecordSave(outcome: SaveOutcome, confirmedByTrainer: boolean | null): boolean {
  if (outcome === 'shared' || outcome === 'saved') return true;
  return outcome === 'downloaded' && confirmedByTrainer === true;
}
