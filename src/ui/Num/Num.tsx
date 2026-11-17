import { Fragment, type ReactNode } from 'react';
import { tParts, type TKey } from '@/i18n';
import { cx } from '../cx';

/** A number (or "8–10", "5:00", "2,400") isolated LTR inside Arabic text. Units go outside. */
export function Num({ children, className }: { children: ReactNode; className?: string }) {
  return <bdi className={cx('num', className)}>{children}</bdi>;
}

/**
 * Translated text whose parameters are rendered as nodes. Numbers become <Num> automatically, so they
 * stay LTR; pass a node to control it yourself.
 */
export function Tx({ k, params }: { k: TKey; params: Record<string, ReactNode> }) {
  const wrapped: Record<string, ReactNode> = {};
  for (const [name, value] of Object.entries(params)) {
    wrapped[name] = typeof value === 'number' ? <Num>{value}</Num> : value;
  }
  return (
    <>
      {tParts<ReactNode>(k, wrapped).map((part, i) => (
        <Fragment key={i}>{part}</Fragment>
      ))}
    </>
  );
}
