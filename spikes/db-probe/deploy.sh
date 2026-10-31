#!/usr/bin/env bash
# Spike S-1.4: deploy the probe next to the S-1.3 service (same region, runtime account and
# build account), with the spike user's Atlas password from Secret Manager.
set -euo pipefail
cd "$(dirname "$0")"
PROJECT=$(gcloud config get-value project)
sa() { echo "$1@$PROJECT.iam.gserviceaccount.com"; }

gcloud secrets add-iam-policy-binding atlas-spike-password --condition=None --quiet \
	--member="serviceAccount:$(sa toe-beans-run)" --role=roles/secretmanager.secretAccessor >/dev/null

gcloud run deploy toe-beans-db-probe --source . --region africa-south1 --quiet \
	--build-service-account="projects/$PROJECT/serviceAccounts/$(sa toe-beans-build)" \
	--service-account="$(sa toe-beans-run)" \
	--no-invoker-iam-check --max-instances=1 --memory=512Mi --cpu-boost \
	--set-env-vars=MONGO_HOST=toe-beans.uitdn6o.mongodb.net,MONGO_USER=toe-beans-spike,MONGO_DB=spike \
	--set-secrets=MONGO_PASSWORD=atlas-spike-password:latest
