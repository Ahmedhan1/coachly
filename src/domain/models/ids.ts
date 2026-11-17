import { z } from 'zod';

const idBody = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, 'invalid id');

export const clientIdSchema = idBody.brand<'ClientId'>();
export const paymentIdSchema = idBody.brand<'PaymentId'>();
export const sessionIdSchema = idBody.brand<'SessionId'>();
export const exerciseIdSchema = idBody.brand<'ExerciseId'>();
export const programIdSchema = idBody.brand<'ProgramId'>();
export const workoutLogIdSchema = idBody.brand<'WorkoutLogId'>();
export const recipeIdSchema = idBody.brand<'RecipeId'>();
export const mealPlanIdSchema = idBody.brand<'MealPlanId'>();
export const supplementIdSchema = idBody.brand<'SupplementId'>();
export const progressEntryIdSchema = idBody.brand<'ProgressEntryId'>();
export const pdfTemplateIdSchema = idBody.brand<'PdfTemplateId'>();
export const imageIdSchema = idBody.brand<'ImageId'>();
/** Ids of nested items (program day, program item, meal) — unique within their parent. */
export const localIdSchema = idBody.brand<'LocalId'>();

export type ClientId = z.infer<typeof clientIdSchema>;
export type PaymentId = z.infer<typeof paymentIdSchema>;
export type SessionId = z.infer<typeof sessionIdSchema>;
export type ExerciseId = z.infer<typeof exerciseIdSchema>;
export type ProgramId = z.infer<typeof programIdSchema>;
export type WorkoutLogId = z.infer<typeof workoutLogIdSchema>;
export type RecipeId = z.infer<typeof recipeIdSchema>;
export type MealPlanId = z.infer<typeof mealPlanIdSchema>;
export type SupplementId = z.infer<typeof supplementIdSchema>;
export type ProgressEntryId = z.infer<typeof progressEntryIdSchema>;
export type PdfTemplateId = z.infer<typeof pdfTemplateIdSchema>;
export type ImageId = z.infer<typeof imageIdSchema>;
export type LocalId = z.infer<typeof localIdSchema>;
