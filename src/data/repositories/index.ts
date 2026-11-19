import type { AppDatabase } from '../db';
import { randomId, systemClock, type Clock, type IdFactory } from '../clock';
import { ClientRepository } from './clientRepository';
import { CloudFileRepository } from './cloudFileRepository';
import type { RepositoryContext } from './entityRepository';
import { ImageRepository } from './imageRepository';
import { PaymentRepository } from './paymentRepository';
import { ProgressRepository } from './progressRepository';
import { SessionRepository } from './sessionRepository';
import { SettingsRepository } from './settingsRepository';
import {
  ExerciseRepository,
  MealPlanRepository,
  PdfTemplateRepository,
  ProgramRepository,
  RecipeRepository,
  SupplementRepository,
  WorkoutLogRepository,
} from './simpleRepositories';

export interface Repositories {
  settings: SettingsRepository;
  clients: ClientRepository;
  payments: PaymentRepository;
  sessions: SessionRepository;
  exercises: ExerciseRepository;
  programs: ProgramRepository;
  workoutLogs: WorkoutLogRepository;
  recipes: RecipeRepository;
  mealPlans: MealPlanRepository;
  supplements: SupplementRepository;
  progress: ProgressRepository;
  pdfTemplates: PdfTemplateRepository;
  images: ImageRepository;
  cloudFiles: CloudFileRepository;
}

export function createRepositories(db: AppDatabase, clock: Clock = systemClock, newId: IdFactory = randomId): Repositories {
  const ctx: RepositoryContext = { db, clock, newId };
  return {
    settings: new SettingsRepository(ctx),
    clients: new ClientRepository(ctx),
    payments: new PaymentRepository(ctx),
    sessions: new SessionRepository(ctx),
    exercises: new ExerciseRepository(ctx),
    programs: new ProgramRepository(ctx),
    workoutLogs: new WorkoutLogRepository(ctx),
    recipes: new RecipeRepository(ctx),
    mealPlans: new MealPlanRepository(ctx),
    supplements: new SupplementRepository(ctx),
    progress: new ProgressRepository(ctx),
    pdfTemplates: new PdfTemplateRepository(ctx),
    images: new ImageRepository(ctx),
    cloudFiles: new CloudFileRepository(ctx),
  };
}

export { NotFoundError, type NewEntity, type EntityPatch } from './entityRepository';
export type { SettingsPatch } from './settingsRepository';
export type { CloudFileContent } from './cloudFileRepository';
