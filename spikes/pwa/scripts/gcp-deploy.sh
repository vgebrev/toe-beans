#!/usr/bin/env bash
# Spike S-1.3: build and deploy to Cloud Run in Johannesburg, then point the every-minute
# Cloud Scheduler tick at it. Re-run to redeploy.
set -euo pipefail
PROJECT=$(gcloud config get-value project)
REGION=africa-south1
# Cloud Scheduler has no africa-south1; Doha is the nearest region it offers.
SCHEDULER_REGION=me-central1
SERVICE=toe-beans-spike
sa() { echo "$1@$PROJECT.iam.gserviceaccount.com"; }
AUDIENCE=toe-beans-tick

# Public service (no invoker IAM check: new orgs block allUsers grants); /internal/tick checks its
# own OIDC token. One instance at most, so the spike's in-memory state isn't split.
gcloud run deploy "$SERVICE" --source . --region "$REGION" --quiet \
	--build-service-account="projects/$PROJECT/serviceAccounts/$(sa toe-beans-build)" \
	--service-account="$(sa toe-beans-run)" \
	--no-invoker-iam-check --max-instances=1 --memory=512Mi --cpu-boost \
	--set-env-vars="VAPID_PUBLIC_KEY=$(grep '^VAPID_PUBLIC_KEY=' .env | cut -d= -f2-)" \
	--set-env-vars="VAPID_SUBJECT=https://toebeans.gebrev.com,TICK_AUDIENCE=$AUDIENCE,TICK_INVOKER=$(sa toe-beans-tick)" \
	--set-secrets=VAPID_PRIVATE_KEY=vapid-private-key:latest

URL=$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')

# No retries: the next tick a minute later is the retry (architecture §6.3).
verb=create
gcloud scheduler jobs describe toe-beans-tick --location "$SCHEDULER_REGION" >/dev/null 2>&1 && verb=update
gcloud scheduler jobs "$verb" http toe-beans-tick --location "$SCHEDULER_REGION" \
	--schedule="* * * * *" --time-zone=Etc/UTC --attempt-deadline=30s \
	--uri="$URL/internal/tick" --http-method=POST \
	$([ "$verb" = create ] && echo --headers || echo --update-headers)=Content-Type=application/json \
	--message-body='{}' \
	--oidc-service-account-email="$(sa toe-beans-tick)" --oidc-token-audience="$AUDIENCE"

# Keep only the three newest images, so storage stays inside the free 0.5 GB.
policy=$(mktemp)
cat > "$policy" <<'JSON'
[{"name":"keep-recent","action":{"type":"Keep"},"mostRecentVersions":{"keepCount":3}},
 {"name":"delete-rest","action":{"type":"Delete"},"condition":{"tagState":"any"}}]
JSON
gcloud artifacts repositories set-cleanup-policies cloud-run-source-deploy --location "$REGION" \
	--policy="$policy" --no-dry-run --quiet >/dev/null

echo "Deployed: $URL"
