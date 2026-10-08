import { pageMetadata } from '@/lib/metadata';
import { RequireAuth } from '@/components/auth/require-auth';
import { ProfileContent } from '@/components/profile/profile-content';
import { PageHeader } from '@/components/shared/page-header';

export const metadata = pageMetadata(
  'Profile',
  'Your ApteeZ profile, activity and saved questions.',
);

export default function ProfilePage(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Your arena identity" title="Profile" description="Your identity, progress and saved questions." />
      <RequireAuth>
        <ProfileContent />
      </RequireAuth>
    </div>
  );
}
