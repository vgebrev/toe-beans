#!/usr/bin/env bash
# S14.3: compares a restored copy with its source, collection by collection: documents and
# indexes (docs/runbooks/restore.md). Prints to your terminal only; run it on your own machine.
#
#   SOURCE_URI=… SOURCE_DB=toe-beans RESTORED_URI=… RESTORED_DB=restore-check infra/backup/compare.sh
#
# SOURCE_URI can be the read-only backup user's string. Writes since the dump show as small
# differences; sessions and pendingSignIns are never in a dump (D36), so they're skipped.
set -euo pipefail
for name in SOURCE_URI SOURCE_DB RESTORED_URI RESTORED_DB; do
	[ -n "${!name:-}" ] || { echo "Set $name" >&2; exit 2; }
done
export SOURCE_URI SOURCE_DB RESTORED_URI RESTORED_DB
mongosh --quiet --nodb --eval '
const env = process.env;
const a = new Mongo(env.SOURCE_URI).getDB(env.SOURCE_DB);
const b = new Mongo(env.RESTORED_URI).getDB(env.RESTORED_DB);
const skipped = new Set(["sessions", "pendingSignIns"]);
const names = [...new Set([...a.getCollectionNames(), ...b.getCollectionNames()])]
	.filter((n) => !skipped.has(n) && !n.startsWith("system.")).sort();
let differ = 0;
const pad = (s, n) => String(s).padEnd(n);
print(pad("collection", 22) + pad("documents", 16) + "indexes");
for (const n of names) {
	const count = (db) => db.getCollectionNames().includes(n) ? db.getCollection(n).countDocuments() : "-";
	const indexes = (db) => db.getCollectionNames().includes(n)
		? db.getCollection(n).getIndexes().map((i) => i.name).sort().join(",") : "-";
	const [ca, cb, ia, ib] = [count(a), count(b), indexes(a), indexes(b)];
	const same = ca === cb && ia === ib;
	if (!same) differ++;
	print(pad(n, 22) + pad(ca + " / " + cb, 16) + (ia === ib ? "same" : "DIFFER") + (same ? "" : "   <--"));
}
print(differ ? differ + " collection(s) differ: writes since the dump, or a problem." : "Everything matches.");
'
