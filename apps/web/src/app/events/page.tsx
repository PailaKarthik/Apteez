import { CalendarDays } from 'lucide-react';
import { pageMetadata } from '@/lib/metadata';
import { PageHeader } from '@/components/shared/page-header';
import { SectionPlaceholder } from '@/components/shared/section-placeholder';

export const metadata = pageMetadata('Events', 'ApteeZ community events and workshops.');

export default function EventsPage(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <PageHeader title="Events" description="Workshops, marathons and community meetups." />
      <SectionPlaceholder
        icon={CalendarDays}
        title="Community calendar"
        description="Live workshops with top solvers, topic marathons and seasonal events — with registrations, reminders and recaps."
        points={[
          'Upcoming event calendar with RSVP',
          'Live workshops and AMAs',
          'Topic marathons with badges',
          'Event recaps and recordings',
        ]}
      />
    </div>
  );
}
