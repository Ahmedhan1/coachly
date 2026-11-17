import { useRepos } from '@/app/services';
import { useLive } from '@/app/useLive';
import { clientsUsingExercise, type ExerciseClientUsage } from '@/domain/exercises';

/** The trainer's clients that have this exercise in their own programs (live; undefined while loading). */
export function useExerciseClients(exerciseId: string): ExerciseClientUsage[] | undefined {
  const repos = useRepos();
  return useLive(async () => {
    const [programs, clients] = await Promise.all([repos.programs.list(), repos.clients.list()]);
    return clientsUsingExercise(exerciseId, programs, clients);
  }, [repos, exerciseId]);
}
