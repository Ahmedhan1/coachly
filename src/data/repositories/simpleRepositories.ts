import {
  exerciseSchema,
  mealPlanSchema,
  pdfTemplateSchema,
  programSchema,
  recipeSchema,
  supplementSchema,
  workoutLogSchema,
  type Exercise,
  type MealPlan,
  type PdfTemplate,
  type Program,
  type Recipe,
  type Supplement,
  type WorkoutLog,
} from '@/domain/models';
import { searchItems } from '../search';
import { TABLES } from '../schema';
import { EntityRepository, type RepositoryContext } from './entityRepository';

export class ExerciseRepository extends EntityRepository<Exercise> {
  constructor(ctx: RepositoryContext) {
    super(ctx, TABLES.exercises, exerciseSchema);
  }
  async search(query: string): Promise<Exercise[]> {
    return searchItems(await this.list(), query, (e) => [e.name, e.equipment, ...e.primaryMuscles]);
  }
}

export class ProgramRepository extends EntityRepository<Program> {
  constructor(ctx: RepositoryContext) {
    super(ctx, TABLES.programs, programSchema);
  }
  async listByClient(clientId: string): Promise<Program[]> {
    return this.table.where('clientId').equals(clientId).filter((p) => p.deletedAt === null).toArray();
  }
}

export class WorkoutLogRepository extends EntityRepository<WorkoutLog> {
  constructor(ctx: RepositoryContext) {
    super(ctx, TABLES.workoutLogs, workoutLogSchema);
  }
  async listByClient(clientId: string): Promise<WorkoutLog[]> {
    return this.table
      .where('[clientId+date]')
      .between([clientId, ''], [clientId, '￿'])
      .filter((l) => l.deletedAt === null)
      .toArray();
  }
}

export class RecipeRepository extends EntityRepository<Recipe> {
  constructor(ctx: RepositoryContext) {
    super(ctx, TABLES.recipes, recipeSchema);
  }
  async search(query: string): Promise<Recipe[]> {
    return searchItems(await this.list(), query, (r) => [r.name, ...r.tags]);
  }
}

export class MealPlanRepository extends EntityRepository<MealPlan> {
  constructor(ctx: RepositoryContext) {
    super(ctx, TABLES.mealPlans, mealPlanSchema);
  }
  async listByClient(clientId: string): Promise<MealPlan[]> {
    return this.table.where('clientId').equals(clientId).filter((p) => p.deletedAt === null).toArray();
  }
}

export class SupplementRepository extends EntityRepository<Supplement> {
  constructor(ctx: RepositoryContext) {
    super(ctx, TABLES.supplements, supplementSchema);
  }
  async search(query: string): Promise<Supplement[]> {
    return searchItems(await this.list(), query, (s) => [s.name, s.notes]);
  }
}

export class PdfTemplateRepository extends EntityRepository<PdfTemplate> {
  constructor(ctx: RepositoryContext) {
    super(ctx, TABLES.pdfTemplates, pdfTemplateSchema);
  }
}
