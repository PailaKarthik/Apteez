// Server-side (Next.js runtime) error tracking. Same DSN gate as client:
// unset means completely disabled.
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0,
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        delete event.request.headers;
        event.request.data = undefined;
      }
      return event;
    },
  });
}
