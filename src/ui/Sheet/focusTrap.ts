const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusableIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute('inert'));
}

/** Keeps Tab / Shift+Tab cycling inside `container`. Returns true when it handled the key. */
export function trapTab(event: KeyboardEvent, container: HTMLElement): boolean {
  if (event.key !== 'Tab') return false;
  const items = focusableIn(container);
  const first = items[0];
  const last = items[items.length - 1];
  if (!first || !last) {
    event.preventDefault();
    container.focus();
    return true;
  }
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !container.contains(active))) {
    event.preventDefault();
    last.focus();
    return true;
  }
  if (!event.shiftKey && (active === last || !container.contains(active))) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
}
