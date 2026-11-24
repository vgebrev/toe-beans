#!/usr/bin/env node
// Gives the Worker a new signing key, and Google the means to check it (architecture D45; security
// audit R1; google-identity.js). Run as the project owner, with `gcloud` signed in and
// `npx wrangler@4 login` done, after infra/gcp/provision.sh has made the pool:
//
//   node infra/edge/edge-key.mjs
//
// It makes an RSA key pair in memory, then:
//   1. puts the public half in the provider `toe-beans-edge` of the pool `cloudflare` (creating
//      it the first time), next to the newest key already there, so tokens the Worker is
//      still signing with that one keep working; any older keys go
//   2. pipes the private half to `wrangler secret put EDGE_KEY`, which deploys it
//
// The private key is never written to disk or printed. Re-run it to rotate; each run retires the
// key before the last one.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT = 'toe-beans-co-za';
const PROJECT_NUMBER = '1047834821273';
const POOL = 'cloudflare';
const PROVIDER = 'toe-beans-edge';
// The Worker's IDENTITY (worker.js) names the same issuer and subject.
const ISSUER = 'https://toebeans.co.za';
const SUBJECT = 'toe-beans-edge';
const AUDIENCE = `https://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}`;

const here = dirname(fileURLToPath(import.meta.url));
const gcloud = (/** @type {string[]} */ ...args) =>
	execFileSync('gcloud', ['--project', PROJECT, '--quiet', ...args], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'inherit']
	});
/** The same, with gcloud's errors kept back: for a check whose failure is an answer. */
const gcloudQuiet = (/** @type {string[]} */ ...args) =>
	execFileSync('gcloud', ['--project', PROJECT, '--quiet', ...args], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'ignore']
	});
const provider = ['iam', 'workload-identity-pools', 'providers'];
const where = [PROVIDER, '--location=global', `--workload-identity-pool=${POOL}`];

const pair = await crypto.subtle.generateKey(
	{
		name: 'RSASSA-PKCS1-v1_5',
		modulusLength: 2048,
		publicExponent: new Uint8Array([1, 0, 1]),
		hash: 'SHA-256'
	},
	true,
	['sign', 'verify']
);
const kid = `edge-${new Date().toISOString().slice(0, 19).replace(/\D/g, '')}`;
const { kty, n, e } = await crypto.subtle.exportKey('jwk', pair.publicKey);
const publicKey = { kty, n, e, kid, alg: 'RS256', use: 'sig' };
const privateKey = { ...(await crypto.subtle.exportKey('jwk', pair.privateKey)), kid };

/** @type {{ oidc?: { jwksJson?: string } } | null} */
let existing = null;
try {
	existing = JSON.parse(gcloudQuiet(...provider, 'describe', ...where, '--format=json'));
} catch {
	// Not made yet (NOT_FOUND). Any other failure shows when create-oidc below fails too.
}
const kept = existing?.oidc?.jwksJson ? JSON.parse(existing.oidc.jwksJson).keys.slice(-1) : [];

const dir = mkdtempSync(join(tmpdir(), 'edge-key-'));
try {
	const jwks = join(dir, 'jwks.json');
	writeFileSync(jwks, JSON.stringify({ keys: [...kept, publicKey] }));
	const settings = [
		`--jwk-json-path=${jwks}`,
		`--allowed-audiences=${AUDIENCE}`,
		'--attribute-mapping=google.subject=assertion.sub',
		// Only the Worker's subject; the pool trusts nothing else.
		`--attribute-condition=assertion.sub == '${SUBJECT}'`
	];
	if (existing) {
		gcloud(...provider, 'update-oidc', ...where, ...settings, '--format=none');
	} else {
		gcloud(
			...provider,
			'create-oidc',
			...where,
			`--issuer-uri=${ISSUER}`,
			'--display-name=Toe Beans edge Worker',
			...settings,
			'--format=none'
		);
	}
} finally {
	rmSync(dir, { recursive: true, force: true });
}
console.log(`Provider ${PROVIDER}: key ${kid}${kept.length ? ` and ${kept[0].kid}` : ''}`);

execFileSync('npx', ['wrangler@4', 'secret', 'put', 'EDGE_KEY'], {
	cwd: here,
	input: JSON.stringify(privateKey),
	stdio: ['pipe', 'inherit', 'inherit']
});
console.log(`EDGE_KEY is ${kid}. The Worker signs with it from its next request.`);
