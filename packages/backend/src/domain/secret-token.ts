// Bearer secrets handed to a browser (session cookies, sign-in handles, later invite links). Only
// their SHA-256 is stored, so a database leak doesn't hand out live sessions (architecture §3.4).
import { createHash, randomBytes } from 'node:crypto';

/** 256 random bits, base64url: safe in a cookie or a URL without encoding. */
export const newSecretToken = (): string => randomBytes(32).toString('base64url');

/** The stored form of a token. A fast hash is enough: the input is 256 random bits, not a password. */
export const hashSecretToken = (token: string): string =>
	createHash('sha256').update(token).digest('base64url');

/** Rejects anything that couldn't be one of our tokens before it reaches a query. */
export const isSecretToken = (value: string): boolean => /^[A-Za-z0-9_-]{43}$/.test(value);
