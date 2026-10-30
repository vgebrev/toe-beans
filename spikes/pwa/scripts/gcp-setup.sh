#!/usr/bin/env bash
# Spike S-1.3, one-off: service accounts and the VAPID secret.
# Needs `gcloud config set project …` done and the APIs from the README enabled. Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/.."   # the spike root: .env and the build context live here
[ -f .env ] || { echo "No .env in $PWD: run pnpm vapid first" >&2; exit 1; }
PROJECT=$(gcloud config get-value project)
REGION=africa-south1
sa() { echo "$1@$PROJECT.iam.gserviceaccount.com"; }

gcloud services enable secretmanager.googleapis.com

# Three identities, none with project-wide roles beyond what it needs.
for name in toe-beans-build toe-beans-run toe-beans-tick; do
	gcloud iam service-accounts describe "$(sa $name)" >/dev/null 2>&1 ||
		gcloud iam service-accounts create "$name" --display-name="Toe Beans spike: ${name#toe-beans-}"
done
# Cloud Build runs `--source` deploys as toe-beans-build (new orgs give default accounts no roles).
gcloud projects add-iam-policy-binding "$PROJECT" --condition=None --quiet \
	--member="serviceAccount:$(sa toe-beans-build)" --role=roles/run.builder >/dev/null

# The VAPID private key lives in Secret Manager, readable only by the runtime account.
gcloud secrets describe vapid-private-key >/dev/null 2>&1 ||
	gcloud secrets create vapid-private-key --replication-policy=user-managed --locations="$REGION"
if [ -z "$(gcloud secrets versions list vapid-private-key --filter=state=enabled --format='value(name)')" ]; then
	grep '^VAPID_PRIVATE_KEY=' .env | cut -d= -f2- | tr -d '\n' |
		gcloud secrets versions add vapid-private-key --data-file=-
fi
gcloud secrets add-iam-policy-binding vapid-private-key --condition=None --quiet \
	--member="serviceAccount:$(sa toe-beans-run)" --role=roles/secretmanager.secretAccessor >/dev/null

echo "Setup done for $PROJECT. Next: scripts/gcp-deploy.sh"
