// Writes a VAPID key pair to .env (once). Keep the same keys between runs, or every
// existing subscription stops working.
import webpush from 'web-push';
import { existsSync, writeFileSync } from 'node:fs';

const file = new URL('../.env', import.meta.url);
if (existsSync(file)) {
	console.log('.env already exists; leaving the VAPID keys alone.');
	process.exit(0);
}
const { publicKey, privateKey } = webpush.generateVAPIDKeys();
writeFileSync(
	file,
	`VAPID_PUBLIC_KEY=${publicKey}\nVAPID_PRIVATE_KEY=${privateKey}\nVAPID_SUBJECT=https://toebeans.gebrev.com\n`
);
console.log('Wrote .env.');
