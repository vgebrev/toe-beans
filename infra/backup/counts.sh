#!/usr/bin/env bash
# S14.6: prints how many documents each collection holds, and how many dogs have a photo, so a
# durability check (docs/runbooks/durability.md, scenario 10) can compare before and after a
# redeploy. Counts only, never contents. Run it on your own machine with the backup user's
# read-only string:
#
#   SOURCE_URI="$(gcloud secrets versions access latest --secret=backup-mongodb-uri --project=toe-beans-co-za)" \
#   	infra/backup/counts.sh > before.txt
set -euo pipefail
[ -n "${SOURCE_URI:-}" ] || { echo "Set SOURCE_URI" >&2; exit 2; }
export SOURCE_URI SOURCE_DB="${SOURCE_DB:-toe-beans}"
mongosh --quiet --nodb --eval '
const db = new Mongo(process.env.SOURCE_URI).getDB(process.env.SOURCE_DB);
const pad = (s, n) => String(s).padEnd(n);
for (const n of db.getCollectionNames().filter((n) => !n.startsWith("system.")).sort()) {
	print(pad(n, 22) + db.getCollection(n).countDocuments());
}
print(pad("dogs with a photo", 22) + db.dogs.countDocuments({ photo: { $type: "object" } }));
'
