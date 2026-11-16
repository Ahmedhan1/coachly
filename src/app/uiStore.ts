import { create } from 'zustand';
import type { ToastItem } from '@/ui';

interface UiState {
  toasts: ToastItem[];
  addClientOpen: boolean;
  quickAddOpen: boolean;
  showToast: (toast: Omit<ToastItem, 'id'>) => void;
  dismissToast: (id: number) => void;
  openAddClient: () => void;
  closeAddClient: () => void;
  openQuickAdd: () => void;
  closeQuickAdd: () => void;
}

let nextToastId = 1;

/** Transient UI state only. Persistent data lives in the repositories. */
export const useUiStore = create<UiState>((set) => ({
  toasts: [],
  addClientOpen: false,
  quickAddOpen: false,
  // Newest toast replaces older ones: one undo at a time keeps it simple for the trainer.
  showToast: (toast) => set({ toasts: [{ ...toast, id: nextToastId++ }] }),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  openAddClient: () => set({ addClientOpen: true, quickAddOpen: false }),
  closeAddClient: () => set({ addClientOpen: false }),
  openQuickAdd: () => set({ quickAddOpen: true }),
  closeQuickAdd: () => set({ quickAddOpen: false }),
}));
