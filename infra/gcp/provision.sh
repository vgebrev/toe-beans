#!/usr/bin/env bash
# S14.1: the production GCP setup (architecture §8, D9, D15). Idempotent: re-running it changes only
# what's missing. Run from anywhere, as the project owner, after `gcloud auth login`:
#
#   infra/gcp/provision.sh
#
# It never prints or reads back a secret value. Secrets that need a value from another service are
# created empty; fill each with infra/gcp/set-secret.sh. See infra/gcp/README.md for what each step
# is for.
set -euo pipefail
cd "$(dirname "$0")/../.."

PROJECT=toe-beans-co-za
REGION=africa-south1
# Cloud Scheduler isn't offered in africa-south1; Doha is the nearest region that has it (§8.4).
SCHEDULER_REGION=me-central1
SERVICE=toe-beans
REPO=toe-beans
GITHUB_REPO=vgebrev/toe-beans
GITHUB_REPO_ID=1441749392
POOL=github
PROVIDER=toe-beans-github
BILLING_ACCOUNT=01479B-1DAED2-C5A37D
BUDGET_USD=${BUDGET_USD:-1}
# Cloud Run's sample container, so the service exists (and the deploy account can be scoped to it)
# before the first real image is built.
PLACEHOLDER=us-docker.pkg.dev/cloudrun/container/hello

gc() { gcloud --project "$PROJECT" --quiet "$@"; }
sa() { echo "$1@$PROJECT.iam.gserviceaccount.com"; }
say() { printf '\n== %s\n' "$*"; }
exists() { "$@" >/dev/null 2>&1; }
PROJECT_NUMBER=$(gc projects describe "$PROJECT" --format='value(projectNumber)')

say "APIs"
gc services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com \
	cloudscheduler.googleapis.com iam.googleapis.com iamcredentials.googleapis.com \
	sts.googleapis.com billingbudgets.googleapis.com

say "Service accounts"
# toe-beans-run: the identity the app runs as; reads its secrets and nothing else.
# toe-beans-tick: Cloud Scheduler signs the tick's OIDC token as this; it holds no roles.
# toe-beans-deploy: GitHub Actions, through Workload Identity Federation; never has a key.
for name in toe-beans-run toe-beans-tick toe-beans-deploy; do
	exists gc iam service-accounts describe "$(sa "$name")" ||
		gc iam service-accounts create "$name" --display-name="Toe Beans: ${name#toe-beans-}"
done

say "Artifact Registry"
exists gc artifacts repositories describe "$REPO" --location "$REGION" ||
	gc artifacts repositories create "$REPO" --location "$REGION" --repository-format=docker \
		--description="Toe Beans app images, deployed by digest"
# The newest five images stay; the free tier is 0.5 GB.
policy=$(mktemp)
trap 'rm -f "$policy"' EXIT
cat >"$policy" <<'JSON'
[{"name":"keep-recent","action":{"type":"Keep"},"mostRecentVersions":{"keepCount":5}},
 {"name":"delete-rest","action":{"type":"Delete"},"condition":{"tagState":"any"}}]
JSON
gc artifacts repositories set-cleanup-policies "$REPO" --location "$REGION" --policy="$policy" \
	--no-dry-run >/dev/null
gc artifacts repositories add-iam-policy-binding "$REPO" --location "$REGION" \
	--member="serviceAccount:$(sa toe-beans-deploy)" --role=roles/artifactregistry.writer >/dev/null

say "Secrets"
secret() {
	exists gc secrets describe "$1" ||
		gc secrets create "$1" --replication-policy=user-managed --locations="$REGION"
	gc secrets add-iam-policy-binding "$1" --condition=None \
		--member="serviceAccount:$(sa toe-beans-run)" --role=roles/secretmanager.secretAccessor >/dev/null
}
has_version() {
	[ -n "$(gc secrets versions list "$1" --filter=state=enabled --format='value(name)' 2>/dev/null)" ]
}
# Filled by the owner (set-secret.sh), from Atlas, Auth0, Resend and Cloudflare R2.
for name in mongodb-uri oidc-client-secret resend-api-key r2-secret-access-key; do secret "$name"; done

# The Worker's header secret (D32): made here, and read by the Worker's deploy.
secret proxy-secret
has_version proxy-secret || openssl rand -base64 48 | tr -d '\n' |
	gc secrets versions add proxy-secret --data-file=- >/dev/null

# Prod's own VAPID pair, made once and never again (a new pair cuts off every device). The spike's
# key in vapid-private-key is disabled, not destroyed; the public key is kept as a secret too, so
# the pair always travels together.
secret vapid-public-key
secret vapid-private-key
if ! has_version vapid-public-key; then
	for _ in 1 2 3; do
		pair=$(node apps/web/scripts/vapid.mjs)
		public=$(sed -n 's/^VAPID_PUBLIC_KEY=//p' <<<"$pair")
		private=$(sed -n 's/^VAPID_PRIVATE_KEY=//p' <<<"$pair")
		# Node drops a leading zero byte now and then; the app wants exactly 32 bytes.
		[ ${#public} -eq 87 ] && [ ${#private} -eq 43 ] && break
	done
	for old in $(gc secrets versions list vapid-private-key --filter=state=enabled --format='value(name)' 2>/dev/null); do
		gc secrets versions disable "$old" --secret=vapid-private-key >/dev/null
	done
	printf %s "$private" | gc secrets versions add vapid-private-key --data-file=- >/dev/null
	printf %s "$public" | gc secrets versions add vapid-public-key --data-file=- >/dev/null
	unset pair private
fi

say "Cloud Run service"
if ! exists gc run services describe "$SERVICE" --region "$REGION"; then
	# Public, with no invoker IAM check (§8.4): the app refuses anything without the Worker's header
	# secret, and /internal/tick checks its own OIDC token. One instance at most: the rate limits
	# live in memory, and it caps what a flood could cost.
	gc run deploy "$SERVICE" --region "$REGION" --image "$PLACEHOLDER" \
		--service-account="$(sa toe-beans-run)" --no-invoker-iam-check \
		--min-instances=0 --max-instances=1 --memory=512Mi --cpu-boost >/dev/null
fi
# The service's deterministic URL (the other, hashed form works too); the tick's audience is this.
URL="https://$SERVICE-$PROJECT_NUMBER.$REGION.run.app"
# The deploy account may change this service and act as its runtime account, nothing more.
gc run services add-iam-policy-binding "$SERVICE" --region "$REGION" \
	--member="serviceAccount:$(sa toe-beans-deploy)" --role=roles/run.developer >/dev/null
gc iam service-accounts add-iam-policy-binding "$(sa toe-beans-run)" \
	--member="serviceAccount:$(sa toe-beans-deploy)" --role=roles/iam.serviceAccountUser >/dev/null

say "Workload Identity Federation"
exists gc iam workload-identity-pools describe "$POOL" --location=global ||
	gc iam workload-identity-pools create "$POOL" --location=global --display-name="GitHub Actions"
# Without the condition any GitHub repo could get a token (D15). The repo is pinned by its numeric
# ID, which survives a rename and can't be reused by someone else's repo.
CONDITION="assertion.repository_id == '$GITHUB_REPO_ID' && assertion.environment == 'production' && assertion.ref == 'refs/heads/main'"
MAPPING="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.environment=assertion.environment,attribute.ref=assertion.ref"
if exists gc iam workload-identity-pools providers describe "$PROVIDER" --location=global --workload-identity-pool="$POOL"; then
	gc iam workload-identity-pools providers update-oidc "$PROVIDER" --location=global \
		--workload-identity-pool="$POOL" --attribute-mapping="$MAPPING" --attribute-condition="$CONDITION" >/dev/null
else
	gc iam workload-identity-pools providers create-oidc "$PROVIDER" --location=global \
		--workload-identity-pool="$POOL" --issuer-uri=https://token.actions.githubusercontent.com \
		--attribute-mapping="$MAPPING" --attribute-condition="$CONDITION"
fi
# Only the production environment's jobs of this repo may act as the deploy account.
POOL_ID="projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL"
gc iam service-accounts add-iam-policy-binding "$(sa toe-beans-deploy)" \
	--role=roles/iam.workloadIdentityUser \
	--member="principal://iam.googleapis.com/$POOL_ID/subject/repo:$GITHUB_REPO:environment:production" >/dev/null

say "Cloud Scheduler tick"
# Every 5 minutes (D27), signed as toe-beans-tick for the service's URL. Created paused: it resumes
# after the first real deploy (README). No retries: the next tick is the retry (§6.3).
verb=create
exists gc scheduler jobs describe toe-beans-tick --location "$SCHEDULER_REGION" && verb=update
gc scheduler jobs "$verb" http toe-beans-tick --location "$SCHEDULER_REGION" \
	--schedule="*/5 * * * *" --time-zone=Etc/UTC --attempt-deadline=60s \
	--uri="$URL/internal/tick" --http-method=POST \
	"$([ "$verb" = create ] && echo --headers || echo --update-headers)=Content-Type=application/json" \
	--message-body='{}' \
	--oidc-service-account-email="$(sa toe-beans-tick)" --oidc-token-audience="$URL" >/dev/null
[ "$verb" = create ] && gc scheduler jobs pause toe-beans-tick --location "$SCHEDULER_REGION" >/dev/null

say "Budget alert"
# A failed list (the API still switching on) must not read as "no budget", or each run adds one.
if ! budgets=$(gc billing budgets list --billing-account="$BILLING_ACCOUNT" --filter="displayName=toe-beans" --format='value(name)'); then
	echo "Couldn't list budgets; re-run in a few minutes to add the alert." >&2
elif [ -z "$budgets" ]; then
	gc billing budgets create --billing-account="$BILLING_ACCOUNT" --display-name=toe-beans \
		--filter-projects="projects/$PROJECT" --budget-amount="${BUDGET_USD}USD" \
		--threshold-rule=percent=0.5 --threshold-rule=percent=1.0 \
		--threshold-rule=percent=1.0,basis=forecasted-spend >/dev/null
fi

say "Checks"
echo "Log retention (_Default bucket, days): $(gc logging buckets describe _Default --location=global --format='value(retentionDays)')"
echo "Project roles held by people:"
gc projects get-iam-policy "$PROJECT" --flatten=bindings[].members \
	--filter='bindings.members~^user:' --format='value(bindings.role,bindings.members)'
echo "Secrets still empty:"
for name in mongodb-uri oidc-client-secret resend-api-key r2-secret-access-key; do
	has_version "$name" || echo "  $name"
done

cat <<EOF

Done. Service URL: $URL
TICK_AUDIENCE=$URL
TICK_INVOKER=$(sa toe-beans-tick)
WIF provider: $POOL_ID/providers/$PROVIDER
Deploy account: $(sa toe-beans-deploy)
EOF
