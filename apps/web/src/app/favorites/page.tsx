import { pageMetadata } from '@/lib/metadata';
import { RequireAuth } from '@/components/auth/require-auth';
import { FavoritesWorkspace } from '@/components/favorites/favorites-workspace';
import { PageHeader } from '@/components/shared/page-header';
import { PageStack } from '@/components/layout/page-container';

export const metadata = pageMetadata(
  'Favorites',
  'Your saved aptitude problems and custom collections.',
);

export default function FavoritesPage(): React.JSX.Element {
  return (
    <PageStack>
      <PageHeader
        eyebrow="Revisit · Revise · Master"
        title="Favorites"
        description="Saved problems and the collections you organise them into."
      />
      <RequireAuth>
        <FavoritesWorkspace />
      </RequireAuth>
    </PageStack>
  );
}
