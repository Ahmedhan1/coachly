/** Source of "now" for the data layer. Injected so tests control time. */
export type Clock = () => number;

export const systemClock: Clock = () => Date.now();

/** Random id generator. Injected so tests can make ids deterministic. */
export type IdFactory = () => string;

export const randomId: IdFactory = () => crypto.randomUUID();
