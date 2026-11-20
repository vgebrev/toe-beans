/**
 * Where the browser sends its error reports, on the app's own origin, for the server to send on
 * to Sentry (architecture D41). Ad blockers block Sentry's hosts; a plain path on the app's origin
 * is on no list.
 */
export const ERROR_RELAY_PATH = '/oops';
