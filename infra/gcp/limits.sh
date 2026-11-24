#!/usr/bin/env bash
# S19.6: what prod holds in GCP against each service's free allowance (architecture D45,
# docs/runbooks/accounts.md "Billing limits"). Read-only, unless --prune-secrets is given:
#
#   infra/gcp/limits.sh                  # the report
#   infra/gcp/limits.sh --prune-secrets  # then offers to destroy disabled secret versions
#
# Run as the project owner, after `gcloud auth login`. It never reads a secret's value. Free
# allowances are per billing account; this project is the only one on it.
set -euo pipefail

PROJECT=toe-beans-co-za
REGION=africa-south1
SCHEDULER_REGION=me-central1
prune=false
case "${1:-}" in
'') ;;
--prune-secrets) prune=true ;;
*) echo "usage: $0 [--prune-secrets]" >&2; exit 2 ;;
esac

gc() { gcloud --project "$PROJECT" --quiet "$@"; }
say() { printf '\n== %s\n' "$*"; }
mb() { awk -v b="$1" 'BEGIN { printf "%.0f MB", b / 1000000 }'; }

say "Artifact Registry (free: 0.5 GB across repositories)"
# gcloud gives a repository's sizeBytes in MB, with decimals.
gc artifacts repositories list --location "$REGION" --format='value(name,sizeBytes)' 2>/dev/null |
	awk '{ n = split($1, p, "/"); printf "  %-28s %.0f MB\n", p[n], $2; t += $2 }
		END { printf "  total %.0f MB%s\n", t, (t > 500 ? "  OVER: lower a keepCount (accounts.md)" : "") }'

say "Secret Manager (free: 6 versions; each more is US\$0.06 a month, enabled or disabled)"
active=0
disabled=()
for secret in $(gc secrets list --format='value(name)'); do
	enabled=$(gc secrets versions list "$secret" --filter=state=enabled --format='value(name)' 2>/dev/null | wc -l)
	off=$(gc secrets versions list "$secret" --filter=state=disabled --format='value(name)' 2>/dev/null)
	for v in $off; do disabled+=("$secret/$v"); done
	count=$((enabled + $(wc -w <<<"$off")))
	active=$((active + count))
	printf '  %-36s %s\n' "$secret" "$count$([ -n "$off" ] && echo " ($(wc -w <<<"$off") disabled)")"
done
over=$((active > 6 ? active - 6 : 0))
echo "  $active versions, $over over the free 6: about US\$$(awk -v n="$over" 'BEGIN { printf "%.2f", n * 0.06 }') a month"

say "Cloud Scheduler (free: 3 jobs)"
gc scheduler jobs list --location "$SCHEDULER_REGION" --format='value(name.basename(),state)' | sed 's/^/  /'

say "Cloud Run (bounded by max instances; the budget's cap stops the rest)"
gc run services list --region "$REGION" \
	--format="value(metadata.name,spec.template.metadata.annotations.'autoscaling.knative.dev/maxScale')" |
	awk '{ printf "  %-28s max %s\n", $1, ($2 == "" ? "unset" : $2) }'

say "Cloud Storage (no free tier in $REGION)"
buckets=$(gc storage buckets list --format='value(name)')
[ -n "$buckets" ] || echo "  none"
for bucket in $buckets; do
	printf '  %-40s %s\n' "$bucket" "$(mb "$(gc storage du -s "gs://$bucket" | awk '{ print $1 }')")"
done

if $prune; then
	say "Disabled secret versions"
	if [ ${#disabled[@]} -eq 0 ]; then
		echo "  none"
	else
		printf '  %s\n' "${disabled[@]}"
		read -rp "Destroy these ${#disabled[@]} versions? They can't be brought back. Type destroy: " answer
		if [ "$answer" = destroy ]; then
			for entry in "${disabled[@]}"; do
				gc secrets versions destroy "${entry##*/}" --secret="${entry%/*}" >/dev/null
			done
			echo "Destroyed."
		else
			echo "Nothing changed."
		fi
	fi
fi
