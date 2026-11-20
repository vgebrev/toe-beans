// The DSN e2e runs with (architecture D41), so the browser SDK loads and reports go through the
// app's relay. Nothing listens at its host: a report the relay accepts gets a 502 back, which
// shows it tried to send it on, and nothing leaves the machine.
export const E2E_SENTRY_DSN = 'https://e2e0public0key@localhost:4175/1';
