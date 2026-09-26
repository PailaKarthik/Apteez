// Client-side error tracking. No DSN means this module never initializes
// Sentry — the app behaves exactly as before, with zero network calls.
import * as Sentry from '@sentry/nextjs';

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    beforeSend(event) {
      // Never ship cookies, auth headers, or form bodies with client errors.
      if (event.request) {
        delete event.request.cookies;
        delete event.request.headers;
        event.request.data = undefined;
      }
      return event;
    },
  });
}
