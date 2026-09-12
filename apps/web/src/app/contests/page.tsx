import { Trophy } from 'lucide-react';
import { pageMetadata } from '@/lib/metadata';
import { PageHeader } from '@/components/shared/page-header';
import { SectionPlaceholder } from '@/components/shared/section-placeholder';

export const metadata = pageMetadata('Contests', 'Scheduled aptitude contests on ApteeZ.');

export default function ContestsPage(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <PageHeader title="Contests" description="Scheduled competitions with ratings on the line." />
      <SectionPlaceholder
        icon={Trophy}
        title="Rated contests"
        description="Weekly and themed contests with a shared start time, live standings and post-contest editorials. Contest state is computed server-side so standings stay fair."
        points={[
          'Upcoming and past contest calendar',
          'Live standings during contest windows',
          'Sectional leaderboards per contest',
          'Editorials and community solutions',
        ]}
      />
    </div>
  );
}
