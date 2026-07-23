import { z } from 'zod';

/**
 * Smoke schema proving the zod boundary is wired. Real client<->server
 * messages are defined here in Cycle 3 and parsed at every boundary.
 */
export const ping = z.object({ type: z.literal('ping') });
export type Ping = z.infer<typeof ping>;
