// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useIncrementalList } from './useIncrementalList';

afterEach(() => {
  cleanup();
  delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
});

type Callback = (entries: Array<{ isIntersecting: boolean }>) => void;
let fire: Callback = () => undefined;

class FakeObserver {
  constructor(cb: Callback) {
    fire = cb;
  }
  observe() {}
  disconnect() {}
}

function List({ total, resetKey }: { total: number; resetKey: string }) {
  const items = Array.from({ length: total }, (_, i) => i);
  const { visible, sentinel } = useIncrementalList(items, { step: 10, resetKey });
  return (
    <div>
      <p data-testid="count">{visible.length}</p>
      {sentinel}
    </div>
  );
}

describe('useIncrementalList', () => {
  it('renders one step, grows when the sentinel nears the viewport, stops at the end', () => {
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = FakeObserver;
    render(<List total={25} resetKey="" />);
    expect(screen.getByTestId('count').textContent).toBe('10');
    act(() => fire([{ isIntersecting: true }]));
    expect(screen.getByTestId('count').textContent).toBe('20');
    act(() => fire([{ isIntersecting: false }]));
    expect(screen.getByTestId('count').textContent).toBe('20');
    act(() => fire([{ isIntersecting: true }]));
    expect(screen.getByTestId('count').textContent).toBe('25');
    expect(screen.queryByTestId('list-sentinel')).toBeNull();
  });

  it('starts over when the reset key (the search text) changes', () => {
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = FakeObserver;
    const { rerender } = render(<List total={50} resetKey="" />);
    act(() => fire([{ isIntersecting: true }]));
    expect(screen.getByTestId('count').textContent).toBe('20');
    rerender(<List total={50} resetKey="سارة" />);
    expect(screen.getByTestId('count').textContent).toBe('10');
  });

  it('shows everything when IntersectionObserver is missing', () => {
    render(<List total={500} resetKey="" />);
    expect(screen.getByTestId('count').textContent).toBe('500');
  });
});
