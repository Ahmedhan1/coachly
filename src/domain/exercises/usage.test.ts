import { describe, expect, it } from 'vitest';
import { clientsUsingExercise, type UsageClient, type UsageProgram } from './usage';

const clients: UsageClient[] = [
  { id: 'c1', name: 'سارة' },
  { id: 'c2', name: 'أحمد' },
];
const program = (over: Partial<UsageProgram> & { id: string; exerciseIds: string[] }): UsageProgram => ({
  id: over.id,
  name: over.name ?? `برنامج ${over.id}`,
  clientId: over.clientId ?? null,
  isTemplate: over.isTemplate ?? false,
  deletedAt: over.deletedAt ?? null,
  days: [{ items: over.exerciseIds.map((exerciseId) => ({ exerciseId })) }],
});

describe('clientsUsingExercise', () => {
  it('lists each client once with the programs that contain the exercise, sorted by name', () => {
    const programs = [
      program({ id: 'p1', clientId: 'c1', exerciseIds: ['squat', 'bench'] }),
      program({ id: 'p2', clientId: 'c1', name: 'تاني', exerciseIds: ['squat'] }),
      program({ id: 'p3', clientId: 'c2', exerciseIds: ['squat'] }),
      program({ id: 'p4', clientId: 'c2', exerciseIds: ['curl'] }),
    ];
    const result = clientsUsingExercise('squat', programs, clients);
    expect(result.map((r) => r.clientId)).toEqual(['c2', 'c1']);
    expect(result[1]?.programNames).toEqual(['برنامج p1', 'تاني']);
  });

  it('ignores templates, unassigned and deleted programs and unknown clients', () => {
    const programs = [
      program({ id: 't', isTemplate: true, clientId: 'c1', exerciseIds: ['squat'] }),
      program({ id: 'n', clientId: null, exerciseIds: ['squat'] }),
      program({ id: 'd', clientId: 'c1', deletedAt: 5, exerciseIds: ['squat'] }),
      program({ id: 'x', clientId: 'ghost', exerciseIds: ['squat'] }),
    ];
    expect(clientsUsingExercise('squat', programs, clients)).toEqual([]);
  });
});
