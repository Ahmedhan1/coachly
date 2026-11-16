import { useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { Icon } from '../icons/Icon';
import { revealDistance, settle } from './swipeMath';
import styles from './SwipeRow.module.css';

const ACTION_WIDTH = 88;
const DRAG_THRESHOLD = 8;

export interface SwipeRowProps {
  children: ReactNode;
  onDelete: () => void;
  deleteLabel: string;
}

interface Drag {
  x: number;
  y: number;
  startOffset: number;
  active: boolean;
  width: number;
  rtl: boolean;
}

/**
 * iOS swipe-to-delete. Swipe toward the inline start to reveal "delete"; a long swipe deletes
 * directly. The delete button is also reachable by keyboard (focus reveals it).
 */
export function SwipeRow({ children, onDelete, deleteLabel }: SwipeRowProps) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [rtl, setRtl] = useState(() => typeof document !== 'undefined' && document.documentElement.dir === 'rtl');
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const rowRef = useRef<HTMLDivElement>(null);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const row = rowRef.current;
    if (!row) return;
    const isRtl = getComputedStyle(row).direction === 'rtl';
    if (isRtl !== rtl) setRtl(isRtl);
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      startOffset: offset,
      active: false,
      width: row.offsetWidth,
      rtl: isRtl,
    };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.active) {
      if (Math.abs(dy) > DRAG_THRESHOLD && Math.abs(dy) > Math.abs(dx)) {
        drag.current = null; // vertical scroll wins
        return;
      }
      if (Math.abs(dx) < DRAG_THRESHOLD) return;
      d.active = true;
      setDragging(true);
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    setOffset(revealDistance(dx, d.rtl, d.startOffset, d.width * 0.85));
  };

  const finish = () => {
    const d = drag.current;
    drag.current = null;
    if (!d?.active) return;
    suppressClick.current = true;
    setDragging(false);
    const outcome = settle(offset, ACTION_WIDTH, d.width);
    if (outcome === 'delete') {
      setOffset(0);
      onDelete();
    } else {
      setOffset(outcome === 'open' ? ACTION_WIDTH : 0);
    }
  };

  const onClickCapture = (e: MouseEvent) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      e.preventDefault();
      e.stopPropagation();
    } else if (offset > 0) {
      e.preventDefault();
      e.stopPropagation();
      setOffset(0);
    }
  };

  return (
    <div ref={rowRef} className={styles.row}>
      <button
        type="button"
        className={styles.action}
        style={{ inlineSize: Math.max(offset, ACTION_WIDTH) }}
        onClick={onDelete}
        onFocus={() => setOffset(ACTION_WIDTH)}
        onBlur={() => setOffset(0)}
        tabIndex={0}
      >
        <Icon name="trash" />
        <span>{deleteLabel}</span>
      </button>
      <div
        className={styles.content}
        data-dragging={dragging || undefined}
        style={{ transform: `translateX(${(rtl ? 1 : -1) * offset}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onClickCapture={onClickCapture}
      >
        {children}
      </div>
    </div>
  );
}
