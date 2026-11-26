// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initials } from './Avatar/Avatar';
import { Chip } from './Chip/Chip';
import { EmptyState } from './EmptyState/EmptyState';
import { FileButton } from './FileButton/FileButton';
import { IconButton } from './IconButton/IconButton';
import { SearchField } from './SearchField/SearchField';
import { SegmentedControl } from './SegmentedControl/SegmentedControl';
import { Stepper } from './Stepper/Stepper';
import { Sheet } from './Sheet/Sheet';
import { SwipeRow } from './SwipeRow/SwipeRow';
import { TextField } from './TextField/TextField';
import { ToastHost } from './Toast/Toast';

afterEach(cleanup);

describe('Sheet', () => {
  const renderSheet = (onClose = vi.fn()) => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
    render(
      <>
        <button>outside</button>
        <Sheet open onClose={onClose} title="عميل جديد" cancelLabel="إلغاء" primaryAction={<button>حفظ</button>}>
          <input aria-label="الاسم" />
        </Sheet>
      </>,
      { container: root },
    );
    return { onClose, root };
  };

  it('is a labelled modal dialog that focuses the first field and makes the app inert', () => {
    const { root } = renderSheet();
    const dialog = screen.getByRole('dialog', { name: 'عميل جديد' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(screen.getByLabelText('الاسم'));
    expect(root.hasAttribute('inert')).toBe(true);
  });

  it('closes on Escape and on backdrop click', () => {
    const { onClose } = renderSheet();
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByTestId('sheet-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('traps Tab inside the panel', () => {
    renderSheet();
    const last = screen.getByLabelText('الاسم');
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'إلغاء' }));
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});

describe('form controls', () => {
  it('TextField links label, hint and error', () => {
    render(<TextField label="الاسم" hint="مطلوب" error="اكتب الاسم" />);
    const input = screen.getByLabelText('الاسم');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toBe('اكتب الاسم');
  });

  it('SegmentedControl is a radio group', () => {
    const onChange = vi.fn();
    const options = [
      { value: 'a', label: 'أ' },
      { value: 'b', label: 'ب' },
    ] as const;
    render(<SegmentedControl label="الهدف" options={options} value="a" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('ب'));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('SearchField clears with its button', () => {
    const onChange = vi.fn();
    render(<SearchField value="سارة" onChange={onChange} placeholder="" label="بحث" clearLabel="مسح" />);
    fireEvent.click(screen.getByRole('button', { name: 'مسح' }));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('Chip exposes its pressed state only when it is a toggle', () => {
    const onClick = vi.fn();
    render(
      <>
        <Chip pressed onClick={onClick}>
          جلوتس
        </Chip>
        <Chip>إضافة</Chip>
      </>,
    );
    const toggle = screen.getByRole('button', { name: 'جلوتس' });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'إضافة' }).hasAttribute('aria-pressed')).toBe(false);
    fireEvent.click(toggle);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('Stepper clamps to its range and accepts Arabic-Indic digits', () => {
    const onChange = vi.fn();
    render(<Stepper label="عدات" value={1} min={1} max={20} step={1} onChange={onChange} />);
    expect((screen.getByRole('button', { name: 'قلّل عدات' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'زوّد عدات' }));
    expect(onChange).toHaveBeenLastCalledWith(2);
    fireEvent.change(screen.getByLabelText('عدات'), { target: { value: '٢٥' } });
    expect(onChange).toHaveBeenLastCalledWith(20);
  });

  it('FileButton hands over the picked files, clears the input, and locks while busy', () => {
    const onFiles = vi.fn();
    const { rerender } = render(
      <FileButton onFiles={onFiles} accept="image/*">
        صورة
      </FileButton>,
    );
    const input = screen.getByLabelText('صورة') as HTMLInputElement;
    expect(input.type).toBe('file');
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onFiles).toHaveBeenCalledWith([file]);
    expect(input.value).toBe('');
    fireEvent.change(input, { target: { files: [] } });
    expect(onFiles).toHaveBeenCalledOnce();
    rerender(
      <FileButton onFiles={onFiles} busy>
        صورة
      </FileButton>,
    );
    expect(input.disabled).toBe(true);
  });

  it('IconButton always has an accessible name', () => {
    render(<IconButton icon="plus" label="إضافة" />);
    expect(screen.getByRole('button', { name: 'إضافة' })).toBeTruthy();
  });
});

describe('feedback', () => {
  it('Toast runs undo and auto-dismisses', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const onAction = vi.fn();
    render(<ToastHost toasts={[{ id: 1, message: 'اتمسح', actionLabel: 'تراجع', onAction, duration: 1000 }]} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: 'تراجع' }));
    expect(onAction).toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1000));
    expect(onDismiss).toHaveBeenCalledWith(1);
    vi.useRealTimers();
  });

  it('EmptyState tells the trainer what to do', () => {
    render(<EmptyState icon="users" title="لسه مفيش عملاء" body="ضيف أول عميل" action={<button>إضافة</button>} />);
    expect(screen.getByRole('heading').textContent).toBe('لسه مفيش عملاء');
    expect(screen.getByRole('button', { name: 'إضافة' })).toBeTruthy();
  });

  it('SwipeRow exposes a named delete button for keyboard users', () => {
    const onDelete = vi.fn();
    render(
      <SwipeRow onDelete={onDelete} deleteLabel="حذف" deleteAccessibleLabel="حذف سارة">
        <span>سارة</span>
      </SwipeRow>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'حذف سارة' }));
    expect(onDelete).toHaveBeenCalled();
  });

  it('initials uses the first letter', () => {
    expect(initials('  سارة محمود')).toBe('س');
  });
});
