// Prints a new VAPID key pair for Web Push (architecture §6.2), to paste into .env (or, for prod,
// the platform's secret store). Keep a pair for good: a new one stops reminders to every device
// until its Notifications screen opens and subscribes again.
import { createECDH } from 'node:crypto';

const ecdh = createECDH('prime256v1');
ecdh.generateKeys();
console.log(`VAPID_PUBLIC_KEY=${ecdh.getPublicKey().toString('base64url')}`);
console.log(`VAPID_PRIVATE_KEY=${ecdh.getPrivateKey().toString('base64url')}`);
