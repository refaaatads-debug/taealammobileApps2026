import * as Sentry from '@sentry/react-native';

// Errors only, release builds only. Never blocks app start.
const DSN = 'https://f41ed672e0467e779ef0b10c8c6559f3@o4512493981270016.ingest.de.sentry.io/4512493986906192';

try {
  if (!__DEV__) {
    Sentry.init({
      dsn: DSN,
      tracesSampleRate: 0,
      enableAutoSessionTracking: false,
      sendDefaultPii: false,
    });
  }
} catch {
  // monitoring must never break the app
}

export { Sentry };
