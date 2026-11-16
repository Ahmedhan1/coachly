import { buildIcs, type IcsError, type IcsEvent, type IcsOptions } from '@/domain/calendar';
import { err, ok, type Result } from '@/domain/nutrition/result';
import { safeFileName, type ShareResult, type ShareService } from '@/services/share/shareService';

export const ICS_MIME = 'text/calendar';

export interface IcsFile {
  blob: Blob;
  fileName: string;
  mimeType: string;
}

/** Wraps .ics text as a file: UTF-8 (Arabic summaries), `.ics` extension, text/calendar. */
export function makeIcsFile(ics: string, name: string): IcsFile {
  const base = safeFileName(name.replace(/\.ics$/i, ''), 'session');
  return {
    blob: new Blob([ics], { type: `${ICS_MIME};charset=utf-8` }),
    fileName: `${base}.ics`,
    mimeType: ICS_MIME,
  };
}

export type CalendarError = IcsError;

export interface CalendarExportResult {
  share: ShareResult;
  file: IcsFile;
}

/** Adding sessions to the iPhone calendar: one event or a weekly series, as an .ics file. */
export interface CalendarService {
  buildFile(events: readonly IcsEvent[], options: IcsOptions, name: string): Result<IcsFile, CalendarError>;
  /** Builds and hands the file to the share sheet (or downloads it). Call from a tap. */
  addToCalendar(
    events: readonly IcsEvent[],
    options: IcsOptions,
    name: string,
    share?: { prefer?: 'share' | 'download'; title?: string },
  ): Promise<Result<CalendarExportResult, CalendarError>>;
}

export class IcsCalendarService implements CalendarService {
  constructor(private readonly share: ShareService) {}

  buildFile(events: readonly IcsEvent[], options: IcsOptions, name: string): Result<IcsFile, CalendarError> {
    const ics = buildIcs(events, options);
    return ics.ok ? ok(makeIcsFile(ics.value, name)) : err(ics.error);
  }

  async addToCalendar(
    events: readonly IcsEvent[],
    options: IcsOptions,
    name: string,
    share: { prefer?: 'share' | 'download'; title?: string } = {},
  ): Promise<Result<CalendarExportResult, CalendarError>> {
    const file = this.buildFile(events, options, name);
    if (!file.ok) return file;
    const outcome = await this.share.shareFile(
      { data: file.value.blob, fileName: file.value.fileName, mimeType: file.value.mimeType, title: share.title },
      { prefer: share.prefer },
    );
    return ok({ share: outcome, file: file.value });
  }
}
