'use client';

import { useParams } from 'next/navigation';
import { EventLiveView } from '@/components/events/event-live-view';
import { PageHeader } from '@/components/shared/page-header';
import { useEvent } from '@/hooks/use-events';

export default function EventLivePage(): React.JSX.Element {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { data: event } = useEvent(id);
  return (
    <div className="space-y-6">
      <PageHeader
        title={event?.title ?? 'Live event'}
        description="Answer, review, and submit before your timer ends. The server owns time and scoring."
      />
      <EventLiveView eventId={id ?? ''} />
    </div>
  );
}
