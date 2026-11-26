import type { Strings } from '../ar';
import { assistant } from './assistant';
import { core } from './core';
import { exercises } from './exercises';
import { files } from './files';
import { hub } from './hub';
import { nutrition } from './nutrition';
import { outbox } from './outbox';
import { pdf } from './pdf';
import { schedule } from './schedule';
import { settings } from './settings';
import { storage } from './storage';
import { training } from './training';
import { team } from './team';
import type { StringShape } from './types';

export type { StringShape } from './types';
type DeepPartial<T> = { [K in keyof T]?: T[K] extends string ? string : DeepPartial<T[K]> };

/**
 * English UI strings. Missing keys fall back to Arabic at runtime; i18n.test.ts lists any gaps.
 * Gym terms keep their normal English names (Biceps Curl, Glutes...).
 */
export const en: DeepPartial<StringShape<Strings>> = {
  ...core,
  training,
  exercises,
  outbox,
  pdf,
  settings,
  storage,
  files,
  schedule,
  assistant,
  hub,
  nutrition,
  team,
};
