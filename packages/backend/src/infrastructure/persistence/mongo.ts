// One pooled MongoClient per process, connected before the server listens (architecture §8.4):
// on Cloud Run, connecting during startup gets the CPU boost, while connecting after the startup
// probe passed took 5.7–31 s instead of 0.3 s (S-1.4).
import { MongoClient, type Db } from 'mongodb';
import type { Readiness } from '../../application/ports/index.js';

export interface MongoConnection {
	client: MongoClient;
	db: Db;
	close(): Promise<void>;
}

export async function connectMongo(uri: string, dbName: string): Promise<MongoConnection> {
	const client = new MongoClient(uri, {
		appName: 'toe-beans',
		retryWrites: true,
		w: 'majority',
		// Optional fields left undefined are omitted rather than stored as null.
		ignoreUndefined: true,
		// Fail a broken deploy in seconds rather than the driver's default 30.
		serverSelectionTimeoutMS: 15_000
	});
	await client.connect();
	return { client, db: client.db(dbName), close: () => client.close() };
}

/** `/readyz`: a ping, given 2 s. The driver reconnects on its own once Atlas is back. */
export const mongoReadiness = (db: Db, timeoutMS = 2000): Readiness => ({
	async check() {
		await db.command({ ping: 1 }, { timeoutMS });
	}
});
