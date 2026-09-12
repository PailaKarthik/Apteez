import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'apteez:is-public';

/**
 * Mark a route as public. The authentication flows of a later prompt will
 * register a global auth guard that skips routes carrying this metadata.
 */
export const Public = (): ReturnType<typeof SetMetadata> => SetMetadata(IS_PUBLIC_KEY, true);
