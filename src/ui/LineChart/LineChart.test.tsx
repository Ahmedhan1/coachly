// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LineChart } from './LineChart';

afterEach(cleanup);

const series = [
  { date: '2026-01-01', value: 80 },
  { date: '2026-02-01', value: 78.5 },
  { date: '2026-03-01', value: 77 },
];

const props = {
  label: 'الوزن',
  formatValue: (v: number) => `${v}`,
  formatDate: (d: string) => d.slice(5),
  dateHeader: 'التاريخ',
  valueHeader: 'القيمة',
};

describe('LineChart', () => {
  it('is an image with an accessible summary and a data table', () => {
    render(<LineChart series={series} {...props} />);
    const img = screen.getByRole('img');
    expect(img).toHaveProperty('tagName', 'svg');
    expect(document.querySelector('title')?.textContent).toBe('الوزن: 77 — 03-01');
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(4);
    expect(screen.getByRole('table').querySelector('caption')?.textContent).toBe('الوزن');
  });

  it('draws one path and a dot per point, with Western-digit ticks', () => {
    const { container } = render(<LineChart series={series} {...props} />);
    expect(container.querySelectorAll('path')).toHaveLength(1);
    expect(container.querySelectorAll('circle')).toHaveLength(3);
    const ticks = [...container.querySelectorAll('text')].map((t) => t.textContent ?? '');
    expect(ticks.every((t) => !/[٠-٩]/.test(t))).toBe(true);
    expect(ticks).toContain('80');
  });

  it('shows the nearest value on tap', () => {
    const { container } = render(<LineChart series={series} {...props} />);
    const svg = container.querySelector('svg');
    if (!svg) throw new Error('no svg');
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 320, height: 180, right: 320, bottom: 180, x: 0, y: 0, toJSON: () => ({}) });
    // jsdom has no layout direction, so this is the LTR geometry: newest point on the right
    fireEvent.pointerDown(svg, { clientX: 300, clientY: 90 });
    expect(container.querySelector('p')?.textContent).toBe('7703-01');
    fireEvent.pointerDown(svg, { clientX: 10, clientY: 90 });
    expect(container.querySelector('p')?.textContent).toBe('8001-01');
  });

  it('renders nothing but the frame for an empty series', () => {
    const { container } = render(<LineChart series={[]} {...props} />);
    expect(container.querySelectorAll('path')).toHaveLength(0);
    expect(screen.queryAllByRole('row')).toHaveLength(1);
  });
});
