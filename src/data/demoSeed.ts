import { addDays, toIsoDate, type Client, type ClientId, type IsoDate } from '@/domain/models';
import type { AppDatabase } from './db';
import { CASCADE_TABLES } from './clientCascade';
import { ENTITY_TABLES } from './schema';
import type { Repositories } from './repositories';

const DEMO_META_KEY = 'demoSeededAt';
const FIRST_RUN_KEY = 'firstRunAt';

type DemoClient = Pick<
  Client,
  'name' | 'phone' | 'gender' | 'goal' | 'goalNote' | 'injuries' | 'measurements' | 'remainingSessions' | 'notes'
> & { startOffset: number; endOffset: number; packageSessions: number; priceEgp: number; checkInDaysAgo: number | null };

/** Demo content, in Arabic, clearly fictional. Offsets are days relative to today. */
const DEMO_CLIENTS: readonly DemoClient[] = [
  {
    name: 'سارة محمود', phone: '01001234567', gender: 'female', goal: 'fat_loss', goalNote: 'تنزل 6 كيلو قبل الصيف',
    injuries: [], measurements: { weightKg: 74, heightCm: 165, waistCm: 82 }, remainingSessions: 3,
    notes: 'بتفضّل الحصص الصبح', startOffset: -25, endOffset: 5, packageSessions: 12, priceEgp: 3000, checkInDaysAgo: 4,
  },
  {
    name: 'أحمد علي', phone: '01112223344', gender: 'male', goal: 'muscle_gain', goalNote: 'زيادة كتلة عضلية',
    injuries: ['ألم خفيف في الكتف اليمين'], measurements: { weightKg: 68, heightCm: 178 }, remainingSessions: 18,
    notes: '', startOffset: -10, endOffset: 50, packageSessions: 24, priceEgp: 5500, checkInDaysAgo: 20,
  },
  {
    name: 'منى حسن', phone: '01223334455', gender: 'female', goal: 'fitness', goalNote: '',
    injuries: [], measurements: { weightKg: 61, heightCm: 160 }, remainingSessions: 0,
    notes: 'محتاجة تجدد', startOffset: -32, endOffset: -2, packageSessions: 8, priceEgp: 2000, checkInDaysAgo: null,
  },
  {
    name: 'كريم يوسف', phone: '01556667788', gender: 'male', goal: 'strength', goalNote: 'ديدليفت 180 كيلو',
    injuries: [], measurements: { weightKg: 88, heightCm: 182, bodyFatPercent: 18 }, remainingSessions: 1,
    notes: '', startOffset: -40, endOffset: 20, packageSessions: 16, priceEgp: 4000, checkInDaysAgo: 6,
  },
  {
    name: 'ياسمين عادل', phone: '01009998877', gender: 'female', goal: 'rehab', goalNote: 'رجوع بعد إصابة الركبة',
    injuries: ['رباط صليبي - الركبة الشمال'], measurements: { weightKg: 58 }, remainingSessions: 9,
    notes: 'ممنوع القفز لحد ما الدكتور يسمح', startOffset: -5, endOffset: 25, packageSessions: 10, priceEgp: 3500,
    checkInDaysAgo: 2,
  },
];

/** Today's demo sessions: [client index, hour, minute]. */
const TODAY_SESSIONS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 8, 0],
  [3, 10, 30],
  [1, 18, 0],
  [4, 20, 0],
];

export async function hasDemoData(db: AppDatabase): Promise<boolean> {
  for (const name of ENTITY_TABLES) {
    if ((await db.table<{ demo: boolean }>(name).filter((r) => r.demo).count()) > 0) return true;
  }
  return false;
}

/** Inserts the demo clients, sessions, payments and check-ins. All rows carry `demo: true`. */
export async function seedDemoData(repos: Repositories, db: AppDatabase, now: Date): Promise<void> {
  const today: IsoDate = toIsoDate(now);
  await db.transaction('rw', db.tables, async () => {
    const clientIds: ClientId[] = [];
    for (const d of DEMO_CLIENTS) {
      const client = await repos.clients.create({
        name: d.name, phone: d.phone, gender: d.gender, birthDate: null, goal: d.goal, goalNote: d.goalNote,
        injuries: [...d.injuries], measurements: d.measurements,
        package: { name: `${d.packageSessions} حصة`, totalSessions: d.packageSessions, priceMinor: d.priceEgp * 100, currency: 'EGP' },
        startDate: addDays(today, d.startOffset), endDate: addDays(today, d.endOffset),
        remainingSessions: d.remainingSessions, notes: d.notes, photoId: null, demo: true,
      });
      clientIds.push(client.id);
      await repos.payments.create({
        clientId: client.id, amountMinor: d.priceEgp * 100, currency: 'EGP', status: 'paid',
        paidOn: addDays(today, d.startOffset), dueOn: null, method: 'cash', note: '', demo: true,
      });
      if (d.checkInDaysAgo !== null && d.measurements.weightKg) {
        await repos.progress.create({
          clientId: client.id, date: addDays(today, -d.checkInDaysAgo), measurements: { weightKg: d.measurements.weightKg },
          photoIds: [], notes: '', source: 'trainer', demo: true,
        });
      }
    }
    const due = clientIds[2];
    if (due) {
      await repos.payments.create({
        clientId: due, amountMinor: 200_000, currency: 'EGP', status: 'due', paidOn: null, dueOn: today,
        method: 'cash', note: 'تجديد', demo: true,
      });
    }
    for (const [index, hour, minute] of TODAY_SESSIONS) {
      const clientId = clientIds[index];
      if (!clientId) continue;
      const startsAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute).getTime();
      await repos.sessions.create({
        clientId, startsAt, durationMin: 60, recurrence: null, seriesId: null,
        attendance: 'scheduled', programId: null, notes: '', demo: true,
      });
    }
    await db.meta.put({ key: DEMO_META_KEY, value: now.getTime() });
  });
}

/** Removes every demo row (hard delete, not undoable) in one transaction. Returns rows removed. */
export async function removeDemoData(db: AppDatabase): Promise<number> {
  return db.transaction('rw', db.tables, async () => {
    let removed = 0;
    const removedIds: string[] = [];
    const demoClientIds = (await db.clients.filter((c) => c.demo).primaryKeys()) as string[];
    for (const name of ENTITY_TABLES) {
      const table = db.table<{ id: string; demo: boolean }, string>(name);
      const ids = new Set((await table.filter((r) => r.demo).primaryKeys()) as string[]);
      // Rows the trainer added to a demo client go with it, so nothing points at a removed client.
      if (demoClientIds.length > 0 && (CASCADE_TABLES as readonly string[]).includes(name)) {
        const owned = (await table.where('clientId').anyOf(demoClientIds).primaryKeys()) as string[];
        for (const id of owned) ids.add(id);
      }
      await table.bulkDelete([...ids]);
      removedIds.push(...ids);
      removed += ids.size;
    }
    const imageIds = (await db.images.filter((i) => i.demo).primaryKeys()) as string[];
    await db.images.bulkDelete(imageIds);
    await db.deletions.where('entityId').anyOf(removedIds).delete();
    await db.meta.delete(DEMO_META_KEY);
    return removed + imageIds.length;
  });
}

/**
 * First launch: stores default settings and seeds demo data exactly once.
 * Later launches (even after the trainer removed the demo) do nothing.
 */
export async function ensureFirstRun(repos: Repositories, db: AppDatabase, now: Date): Promise<boolean> {
  if (await db.meta.get(FIRST_RUN_KEY)) return false;
  await db.transaction('rw', db.tables, async () => {
    if (await db.meta.get(FIRST_RUN_KEY)) return;
    if (!(await repos.settings.exists())) await repos.settings.update({});
    await seedDemoData(repos, db, now);
    await db.meta.put({ key: FIRST_RUN_KEY, value: now.getTime() });
  });
  return true;
}
