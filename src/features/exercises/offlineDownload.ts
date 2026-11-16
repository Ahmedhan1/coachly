import { create } from 'zustand';
import type { ExercisePack } from '@/domain/exercises';
import { exercisePackService, type DownloadProgress, type DownloadResult, type OfflinePhotosStatus } from '@/services/exercisePack';

interface OfflineDownloadState {
  running: boolean;
  progress: DownloadProgress | null;
  result: DownloadResult | null;
  status: OfflinePhotosStatus | null;
  refresh: (pack: ExercisePack) => Promise<void>;
  start: (pack: ExercisePack) => Promise<void>;
  cancel: () => void;
}

let controller: AbortController | null = null;

/** "Download all photos" keeps running when its sheet is closed; one run at a time. */
export const useOfflineDownload = create<OfflineDownloadState>((set, get) => ({
  running: false,
  progress: null,
  result: null,
  status: null,
  refresh: async (pack) => set({ status: await exercisePackService.offlineStatus(pack) }),
  start: async (pack) => {
    if (get().running) return;
    controller = new AbortController();
    set({ running: true, result: null, progress: null });
    try {
      const result = await exercisePackService.downloadAll(pack, {
        signal: controller.signal,
        onProgress: (progress) => set({ progress }),
      });
      set({ result });
    } finally {
      controller = null;
      set({ running: false });
      await get().refresh(pack);
    }
  },
  cancel: () => controller?.abort(),
}));
