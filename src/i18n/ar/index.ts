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
import { team } from './team';
import { training } from './training';

/**
 * Every user-visible string in the app. Egyptian Arabic, Western digits.
 * Placeholders use {name}. Fitness terms come from fitness-terms.ts, never translated here.
 */
export const ar = {
  ...core,
  schedule,
  training,
  exercises,
  nutrition,
  outbox,
  pdf,
  settings,
  storage,
  files,
  assistant,
  hub,
  team,
} as const;

export type Strings = typeof ar;
