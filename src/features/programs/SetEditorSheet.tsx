import { useState } from 'react';
import type { ProgramItem } from '@/domain/models';
import { formatReps, normalizeTempo, parseReps, type ProgramItemPatch, type RepsSpec } from '@/domain/programs';
import { t } from '@/i18n';
import { Button, Icon, SegmentedControl, Select, Sheet, Stepper, TextField } from '@/ui';
import styles from './Shared.module.css';

const TEMPO = /^(\d|X)?(-(\d|X)){0,3}$|^$/i;
const RPE_OPTIONS = ['', '6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10'] as const;

export interface SetEditorSheetProps {
  item: ProgramItem | null;
  name: string;
  onClose: () => void;
  onChange: (patch: ProgramItemPatch) => void;
  onMove: (delta: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onToggleSuperset: () => void;
  canLinkNext: boolean;
  onSwap: () => void;
  onRemove: () => void;
  /** When the program belongs to a client: their own note on this exercise and the editor for it. */
  clientNote?: { label: string; text: string; onEdit: () => void } | null;
}

/** Bottom sheet editing one exercise of a day. Every change autosaves; "تم" just closes. */
export function SetEditorSheet(props: SetEditorSheetProps) {
  const { item, name, onClose } = props;
  return (
    <Sheet
      open={item !== null}
      onClose={onClose}
      title={name}
      cancelLabel={t('common.close')}
      initialFocusId="set-editor-done"
      primaryAction={
        <Button size="small" id="set-editor-done" onClick={onClose}>
          {t('training.programs.editor.done')}
        </Button>
      }
    >
      {item && <EditorBody key={item.id} {...props} item={item} />}
    </Sheet>
  );
}

function EditorBody({ item, onChange, onMove, canMoveUp, canMoveDown, onToggleSuperset, canLinkNext, onSwap, onRemove, name, clientNote }: SetEditorSheetProps & { item: ProgramItem }) {
  const spec = parseReps(item.reps);
  const [tempo, setTempo] = useState(item.tempo);
  const [tempoError, setTempoError] = useState<string | null>(null);
  const [repsText, setRepsText] = useState(spec.kind === 'text' ? spec.text : '');

  const setReps = (next: RepsSpec) => {
    const text = formatReps(next);
    if (text !== '') onChange({ reps: text });
  };
  const commitTempo = () => {
    const normalized = normalizeTempo(tempo);
    if (!TEMPO.test(normalized) || normalized.length > 12) {
      setTempoError(t('training.programs.editor.tempoInvalid'));
      return;
    }
    setTempoError(null);
    setTempo(normalized);
    if (normalized !== item.tempo) onChange({ tempo: normalized });
  };

  return (
    <div className={styles.editor}>
      <div className={styles.editorGrid}>
        <Stepper
          label={t('training.programs.editor.sets')}
          value={item.sets}
          min={1}
          max={20}
          step={1}
          onChange={(sets) => onChange({ sets })}
          testId="editor-sets"
        />
        <Stepper
          label={t('training.programs.editor.rest')}
          value={item.restSec}
          min={0}
          max={900}
          step={15}
          onChange={(restSec) => onChange({ restSec })}
          testId="editor-rest"
        />
      </div>

      <SegmentedControl
        label={t('training.programs.editor.repsKind')}
        value={spec.kind}
        options={[
          { value: 'single', label: t('training.programs.editor.repsSingle') },
          { value: 'range', label: t('training.programs.editor.repsRange') },
          { value: 'text', label: t('training.programs.editor.repsText') },
        ]}
        onChange={(kind) => {
          if (kind === 'single') setReps({ kind: 'single', value: spec.kind === 'range' ? spec.max : spec.kind === 'single' ? spec.value : 10 });
          if (kind === 'range') {
            const v = spec.kind === 'single' ? spec.value : 10;
            setReps({ kind: 'range', min: Math.max(1, v - 2), max: v });
          }
          if (kind === 'text') {
            const text = repsText || 'AMRAP';
            setRepsText(text);
            onChange({ reps: text });
          }
        }}
      />
      {spec.kind === 'single' && (
        <Stepper
          label={t('training.programs.editor.reps')}
          value={spec.value}
          min={1}
          max={100}
          step={1}
          onChange={(value) => setReps({ kind: 'single', value })}
          testId="editor-reps"
        />
      )}
      {spec.kind === 'range' && (
        <div className={styles.editorGrid}>
          <Stepper
            label={t('training.programs.editor.repsMin')}
            value={spec.min}
            min={1}
            max={Math.max(1, spec.max - 1)}
            step={1}
            onChange={(min) => setReps({ kind: 'range', min, max: spec.max })}
            testId="editor-reps-min"
          />
          <Stepper
            label={t('training.programs.editor.repsMax')}
            value={spec.max}
            min={spec.min + 1}
            max={100}
            step={1}
            onChange={(max) => setReps({ kind: 'range', min: spec.min, max })}
            testId="editor-reps-max"
          />
        </div>
      )}
      {spec.kind === 'text' && (
        <TextField
          label={t('training.programs.editor.repsTextLabel')}
          value={repsText}
          maxLength={20}
          ltr
          onChange={(e) => setRepsText(e.target.value)}
          onBlur={() => repsText.trim() && onChange({ reps: repsText.trim() })}
        />
      )}

      <div className={styles.editorGrid}>
        <TextField
          label={t('training.programs.editor.tempo')}
          hint={t('training.programs.editor.tempoHint')}
          error={tempoError}
          value={tempo}
          ltr
          inputMode="numeric"
          maxLength={12}
          onChange={(e) => setTempo(e.target.value)}
          onBlur={commitTempo}
        />
        <Select
          label={t('training.programs.editor.rpe')}
          value={item.rpe === null ? '' : String(item.rpe)}
          options={RPE_OPTIONS.map((v) => ({ value: v, label: v === '' ? t('training.programs.editor.rpeNone') : v }))}
          onChange={(v) => onChange({ rpe: v === '' ? null : Number(v) })}
        />
      </div>

      <TextField
        label={t('training.programs.editor.notes')}
        defaultValue={item.notes}
        maxLength={200}
        onBlur={(e) => e.target.value.trim() !== item.notes && onChange({ notes: e.target.value.trim() })}
      />

      {clientNote && (
        <div className={styles.clientNote}>
          {clientNote.text && <p className={styles.clientNoteText}>{clientNote.text}</p>}
          <Button variant="secondary" size="small" icon="edit" onClick={clientNote.onEdit}>
            {clientNote.label}
          </Button>
        </div>
      )}

      <div className={styles.editorActions}>
        <Button icon="arrowUp" variant="secondary" size="small" disabled={!canMoveUp} onClick={() => onMove(-1)}>
          {t('training.programs.builder.moveUp', { name })}
        </Button>
        <Button icon="arrowDown" variant="secondary" size="small" disabled={!canMoveDown} onClick={() => onMove(1)}>
          {t('training.programs.builder.moveDown', { name })}
        </Button>
      </div>
      <div className={styles.editorActions}>
        {(item.supersetGroup !== null || canLinkNext) && (
          <button type="button" className={styles.textAction} onClick={onToggleSuperset}>
            <Icon name="link" />
            {item.supersetGroup !== null ? t('training.programs.editor.unlink') : t('training.programs.editor.linkNext')}
          </button>
        )}
        <button type="button" className={styles.textAction} onClick={onSwap}>
          <Icon name="swap" />
          {t('training.programs.editor.swap')}
        </button>
        <button type="button" className={`${styles.textAction} ${styles.danger}`} onClick={onRemove}>
          <Icon name="trash" />
          {t('training.programs.editor.remove')}
        </button>
      </div>
    </div>
  );
}
