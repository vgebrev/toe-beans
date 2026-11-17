#!/usr/bin/env bash
# Adds a value to one of prod's secrets without it reaching the screen, the shell history or a file:
#
#   infra/gcp/set-secret.sh mongodb-uri
#
# Paste the value at the prompt and press Enter. Older versions are disabled, not destroyed, so a
# mistake can be undone in the console.
set -euo pipefail
[ $# -eq 1 ] || { echo "usage: $0 <secret-name>" >&2; exit 2; }
PROJECT=toe-beans-co-za
name=$1
gcloud --project "$PROJECT" secrets describe "$name" >/dev/null ||
	{ echo "No secret $name: run infra/gcp/provision.sh first" >&2; exit 1; }
read -rsp "Value for $name: " value
echo
[ -n "$value" ] || { echo "Empty value, nothing changed" >&2; exit 1; }
old=$(gcloud --project "$PROJECT" secrets versions list "$name" --filter=state=enabled --format='value(name)' 2>/dev/null)
printf %s "$value" | gcloud --project "$PROJECT" secrets versions add "$name" --data-file=- >/dev/null
unset value
for v in $old; do
	gcloud --project "$PROJECT" --quiet secrets versions disable "$v" --secret="$name" >/dev/null
done
echo "$name updated."
