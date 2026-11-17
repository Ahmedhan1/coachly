import {
  defaultTrainerSettings,
  TRAINER_SETTINGS_ID,
  trainerSettingsSchema,
  type TrainerSettings,
} from '@/domain/models';
import type { RepositoryContext } from './entityRepository';

export type SettingsPatch = Partial<Omit<TrainerSettings, 'id' | 'updatedAt'>>;

/** The single trainer-settings row. Reads fall back to defaults until the first write. */
export class SettingsRepository {
  constructor(private readonly ctx: RepositoryContext) {}

  async get(): Promise<TrainerSettings> {
    return (await this.ctx.db.settings.get(TRAINER_SETTINGS_ID)) ?? defaultTrainerSettings(0);
  }

  async exists(): Promise<boolean> {
    return (await this.ctx.db.settings.get(TRAINER_SETTINGS_ID)) !== undefined;
  }

  async update(patch: SettingsPatch): Promise<TrainerSettings> {
    return this.ctx.db.transaction('rw', this.ctx.db.settings, async () => {
      const current = await this.get();
      const next = trainerSettingsSchema.parse({
        ...current,
        ...patch,
        id: TRAINER_SETTINGS_ID,
        updatedAt: this.ctx.clock(),
      });
      await this.ctx.db.settings.put(next);
      return next;
    });
  }
}
