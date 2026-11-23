#!/usr/bin/env bash
# S19.5: the spending cap (architecture D45). Idempotent, like infra/gcp/provision.sh, which it
# follows: run that first. Run as the project owner, after `gcloud auth login`:
#
#   infra/spending-cap/provision.sh
#
# It builds and deploys the cap's service from this directory each time, so re-run it after
# changing cap.js or server.js. What each step is for: README.md here.
set -euo pipefail
cd "$(dirname "$0")"

PROJECT=toe-beans-co-za
REGION=africa-south1
SCHEDULER_REGION=me-central1
APP_SERVICE=toe-beans
TICK_JOB=toe-beans-tick
BUDGET_NAME=toe-beans
CAP=toe-beans-cap
TOPIC=toe-beans-budget
# Cloud Billing publishes budget messages as this account.
BUDGET_PUBLISHER=billing-budget-alert@system.gserviceaccount.com

gc() { gcloud --project "$PROJECT" --quiet "$@"; }
sa() { echo "$1@$PROJECT.iam.gserviceaccount.com"; }
say() { printf '\n== %s\n' "$*"; }
exists() { "$@" >/dev/null 2>&1; }
PROJECT_NUMBER=$(gc projects describe "$PROJECT" --format='value(projectNumber)')
# Looked up rather than written here: not a secret (IAM guards the account), but no need to publish it.
BILLING_ACCOUNT=$(gcloud billing projects describe "$PROJECT" --format='value(billingAccountName)')
BILLING_ACCOUNT=${BILLING_ACCOUNT#billingAccounts/}

say "APIs"
gc services enable pubsub.googleapis.com run.googleapis.com cloudbuild.googleapis.com \
	artifactregistry.googleapis.com cloudscheduler.googleapis.com billingbudgets.googleapis.com

say "Service accounts"
# toe-beans-cap: the cap's identity; it may close the app's ingress and pause the tick, nothing
# else. toe-beans-build: Cloud Build's identity for the cap's source deploys (it was the S-1.3
# spike's; roles/run.builder is the role Google made for exactly this).
for name in "$CAP" toe-beans-build; do
	exists gc iam service-accounts describe "$(sa "$name")" ||
		gc iam service-accounts create "$name" --display-name="Toe Beans: ${name#toe-beans-}"
done
gc projects add-iam-policy-binding "$PROJECT" --condition=None \
	--member="serviceAccount:$(sa toe-beans-build)" --role=roles/run.builder >/dev/null

say "The cap's roles"
# Custom roles hold only the permissions the cap uses (cap.js). Scheduler has no IAM on a single
# job, so its role is on the project; the Run role is on the app's service alone. No actAs on
# toe-beans-run: changing ingress makes no revision, and without it the cap can't deploy code.
role() {
	local id=$1 title=$2 permissions=$3
	if exists gc iam roles describe "$id"; then
		gc iam roles update "$id" --permissions="$permissions" >/dev/null
	else
		gc iam roles create "$id" --title="$title" --permissions="$permissions" --stage=GA >/dev/null
	fi
}
role toe_beans_cap_scheduler "Toe Beans: cap pauses the tick" \
	cloudscheduler.jobs.get,cloudscheduler.jobs.pause
role toe_beans_cap_run "Toe Beans: cap closes the app's ingress" run.services.get,run.services.update
gc projects add-iam-policy-binding "$PROJECT" --condition=None \
	--member="serviceAccount:$(sa "$CAP")" \
	--role="projects/$PROJECT/roles/toe_beans_cap_scheduler" >/dev/null
gc run services add-iam-policy-binding "$APP_SERVICE" --region "$REGION" \
	--member="serviceAccount:$(sa "$CAP")" --role="projects/$PROJECT/roles/toe_beans_cap_run" >/dev/null

say "The cap's service"
# Built from this directory by Cloud Build (.gcloudignore sends only the service's files).
# Internal ingress and no unauthenticated calls: only the push subscription below reaches it.
gc run deploy "$CAP" --region "$REGION" --source . \
	--service-account="$(sa "$CAP")" \
	--build-service-account="projects/$PROJECT/serviceAccounts/$(sa toe-beans-build)" \
	--no-allow-unauthenticated --ingress=internal \
	--min-instances=0 --max-instances=1 --memory=256Mi --concurrency=1 --timeout=60 \
	--set-env-vars="PROJECT=$PROJECT,APP_REGION=$REGION,APP_SERVICE=$APP_SERVICE,SCHEDULER_REGION=$SCHEDULER_REGION,TICK_JOB=$TICK_JOB,BUDGET_NAME=$BUDGET_NAME" \
	>/dev/null
CAP_URL="https://$CAP-$PROJECT_NUMBER.$REGION.run.app"
# Source deploys push to this repo; one image is all it needs, against the free 0.5 GB.
policy=$(mktemp)
trap 'rm -f "$policy"' EXIT
cat >"$policy" <<'JSON'
[{"name":"keep-recent","action":{"type":"Keep"},"mostRecentVersions":{"keepCount":2}},
 {"name":"delete-rest","action":{"type":"Delete"},"condition":{"tagState":"any"}}]
JSON
gc artifacts repositories set-cleanup-policies cloud-run-source-deploy --location "$REGION" \
	--policy="$policy" --no-dry-run >/dev/null

say "Pub/Sub"
exists gc pubsub topics describe "$TOPIC" || gc pubsub topics create "$TOPIC" >/dev/null
gc pubsub topics add-iam-policy-binding "$TOPIC" \
	--member="serviceAccount:$BUDGET_PUBLISHER" --role=roles/pubsub.publisher >/dev/null
# The push signs an OIDC token as the cap's account, which may call the cap's service and no other.
gc run services add-iam-policy-binding "$CAP" --region "$REGION" \
	--member="serviceAccount:$(sa "$CAP")" --role=roles/run.invoker >/dev/null
gc iam service-accounts add-iam-policy-binding "$(sa "$CAP")" \
	--member="serviceAccount:service-$PROJECT_NUMBER@gcp-sa-pubsub.iam.gserviceaccount.com" \
	--role=roles/iam.serviceAccountTokenCreator >/dev/null
# A failed push comes back with backoff, up to 10 minutes apart; a day's messages are kept, and
# the budget sends fresh ones anyway.
sub_flags=(--push-endpoint="$CAP_URL/" --push-auth-service-account="$(sa "$CAP")"
	--push-auth-token-audience="$CAP_URL" --ack-deadline=60
	--min-retry-delay=10s --max-retry-delay=600s --message-retention-duration=1d)
if exists gc pubsub subscriptions describe "$CAP"; then
	gc pubsub subscriptions update "$CAP" "${sub_flags[@]}" >/dev/null
else
	gc pubsub subscriptions create "$CAP" --topic="$TOPIC" "${sub_flags[@]}" >/dev/null
fi

say "Budget"
# From here on, the budget's messages reach the cap. Its mails to the owner stay as they are.
budget=$(gc billing budgets list --billing-account="$BILLING_ACCOUNT" \
	--filter="displayName=$BUDGET_NAME" --format='value(name)')
[ -n "$budget" ] || { echo "No budget named $BUDGET_NAME: run infra/gcp/provision.sh" >&2; exit 1; }
gc billing budgets update "$budget" --billing-account="$BILLING_ACCOUNT" \
	--notifications-rule-pubsub-topic="projects/$PROJECT/topics/$TOPIC" >/dev/null

cat <<EOF

Done. The cap: $CAP_URL, fed by $TOPIC through the subscription $CAP.
Check it with a message under budget (docs/runbooks/spending-cap.md §2).
EOF
