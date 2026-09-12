import type { Metadata } from 'next';
import { BRAND } from '@apteez/config';

/**
 * Page-level metadata with the brand suffix baked in.
 *
 * Ancestor `title.template` values apply inconsistently across nesting
 * depths (the root template fires for `/challenge` but not for `/`), so
 * titles stay explicit through this helper instead of relying on template
 * inheritance. The root layout keeps a `default` title as a fallback.
 */
export function pageMetadata(title: string, description: string): Metadata {
  return {
    title: `${title} · ${BRAND.name}`,
    description,
  };
}
