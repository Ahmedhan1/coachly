import { z } from 'zod';

/**
 * Must be the first import of the app (src/app/App.tsx). Zod's JIT probes `new Function('')` when the first
 * object schema is built; under our CSP (no 'unsafe-eval', shared/appHeaders.ts) that probe is refused and
 * logged as a CSP violation on every launch. Jitless parsing is the same validation, without eval.
 */
z.config({ jitless: true });
