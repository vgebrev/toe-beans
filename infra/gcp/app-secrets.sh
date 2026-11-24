#!/usr/bin/env bash
# Prod's one secret, `app-secrets` (architecture D45, S19.6): a JSON object of the app's secret
# variables, which the app spreads into its environment (APP_SECRETS, packages/backend/src/config.ts).
# One secret, so Secret Manager bills one version instead of one per value. Run as the project owner:
#
#   infra/gcp/app-secrets.sh keys              # which variables it holds (never their values)
#   infra/gcp/app-secrets.sh set RESEND_API_KEY        # prompts without echoing
#   infra/gcp/app-secrets.sh generate PROXY_SECRET     # a new random value (rotation)
#   infra/gcp/app-secrets.sh generate VAPID_PRIVATE_KEY  # only if there's none yet
#   infra/gcp/app-secrets.sh get PROXY_SECRET  # prints one value, for $(…) in a runbook
#   infra/gcp/app-secrets.sh migrate           # once: from the separate secrets before S19.6
#
# Each change adds a version and disables the one it replaces, so a mistake can be undone in the
# console; versions disabled before that are destroyed, since a disabled version bills too. The
# app reads `latest` when an instance starts: a change reaches prod on the next start or deploy.
set -euo pipefail
cd "$(dirname "$0")/../.."

PROJECT=toe-beans-co-za
SECRET=app-secrets
KEYS="MONGODB_URI OIDC_CLIENT_SECRET AUTH0_MANAGEMENT_CLIENT_SECRET RESEND_API_KEY S3_SECRET_ACCESS_KEY PROXY_SECRET VAPID_PRIVATE_KEY TICK_HEARTBEAT_URL"

gc() { gcloud --project "$PROJECT" --quiet "$@"; }
usage() { sed -n '6,11p' "$0" | sed 's/^# *//' >&2; exit 2; }
known() { [[ " $KEYS " == *" $1 "* ]] || { echo "$1 isn't one of: $KEYS" >&2; exit 2; }; }
has_version() { [ -n "$(gc secrets versions list "$SECRET" --filter=state=enabled --format='value(name)' 2>/dev/null)" ]; }
current() { if has_version; then gc secrets versions access latest --secret="$SECRET"; else echo '{}'; fi; }

# The bundle's JSON, with KEY set to VALUE (both from the environment), after a format check.
# Values reach node through its environment, never its arguments, which other users can see.
merged() {
	node -e '
		const { CURRENT, KEY, VALUE } = process.env;
		const formats = {
			MONGODB_URI: /^mongodb(\+srv)?:\/\//,
			PROXY_SECRET: /^.{32,200}$/,
			VAPID_PRIVATE_KEY: /^[A-Za-z0-9_-]{43}$/,
			TICK_HEARTBEAT_URL: /^https:\/\//
		};
		if (formats[KEY] && !formats[KEY].test(VALUE)) {
			console.error(`That does not look like a ${KEY}; nothing changed`);
			process.exit(1);
		}
		const bundle = JSON.parse(CURRENT);
		bundle[KEY] = VALUE;
		process.stdout.write(JSON.stringify(bundle));
	'
}

# Adds the JSON on stdin as the new version, then disables the old one and destroys older ones.
write() {
	local enabled disabled
	enabled=$(gc secrets versions list "$SECRET" --filter=state=enabled --format='value(name)' 2>/dev/null)
	disabled=$(gc secrets versions list "$SECRET" --filter=state=disabled --format='value(name)' 2>/dev/null)
	gc secrets versions add "$SECRET" --data-file=- >/dev/null
	for v in $enabled; do gc secrets versions disable "$v" --secret="$SECRET" >/dev/null; done
	for v in $disabled; do gc secrets versions destroy "$v" --secret="$SECRET" >/dev/null; done
}

put() {
	local json
	json=$(CURRENT="$(current)" KEY="$1" VALUE="$2" merged)
	printf %s "$json" | write
	echo "$1 updated in $SECRET."
}

gc secrets describe "$SECRET" >/dev/null 2>&1 ||
	{ echo "No secret $SECRET: run infra/gcp/provision.sh first" >&2; exit 1; }

case "${1:-}" in
keys)
	current | node -e 'const b = JSON.parse(require("fs").readFileSync(0, "utf8"));
		const keys = process.argv.slice(1);
		for (const k of keys) console.log(`${k in b ? "set    " : "missing"} ${k}`);' $KEYS
	;;
get)
	[ $# -eq 2 ] || usage
	known "$2"
	current | KEY="$2" node -e 'const b = JSON.parse(require("fs").readFileSync(0, "utf8"));
		if (!(process.env.KEY in b)) { console.error(`${process.env.KEY} is not set`); process.exit(1); }
		process.stdout.write(b[process.env.KEY]);'
	;;
set)
	[ $# -eq 2 ] || usage
	known "$2"
	read -rsp "Value for $2: " value
	echo
	[ -n "$value" ] || { echo "Empty value, nothing changed" >&2; exit 1; }
	put "$2" "$value"
	unset value
	;;
generate)
	[ $# -eq 2 ] || usage
	case "$2" in
	PROXY_SECRET) put PROXY_SECRET "$(openssl rand -base64 48 | tr -d '\n')" ;;
	VAPID_PRIVATE_KEY)
		# Never replaced by this: a new pair cuts off every device until each opens the app again.
		current | node -e 'process.exit("VAPID_PRIVATE_KEY" in JSON.parse(require("fs").readFileSync(0, "utf8")) ? 1 : 0)' ||
			{ echo "There's already a VAPID key; replacing it cuts off every device (accounts.md)" >&2; exit 1; }
		# Node drops a leading zero byte now and then; the app wants exactly 32 bytes.
		for _ in 1 2 3; do
			key=$(sed -n 's/^VAPID_PRIVATE_KEY=//p' <<<"$(node apps/web/scripts/vapid.mjs)")
			[ ${#key} -eq 43 ] && break
		done
		put VAPID_PRIVATE_KEY "$key"
		unset key
		;;
	*) echo "Only PROXY_SECRET and VAPID_PRIVATE_KEY can be generated" >&2; exit 2 ;;
	esac
	;;
migrate)
	! has_version || { echo "$SECRET already has a version; use set" >&2; exit 1; }
	# Each old secret's value goes into the subshell's environment for node, never onto the screen.
	json=$(
		while read -r old key; do
			# Checked here: a failure inside $(…) wouldn't stop the script by itself.
			value=$(gc secrets versions access latest --secret="$old") && [ -n "$value" ] ||
				{ echo "Couldn't read $old; nothing changed" >&2; exit 1; }
			declare -x "$key=$value"
		done <<-EOF
			mongodb-uri MONGODB_URI
			oidc-client-secret OIDC_CLIENT_SECRET
			auth0-management-client-secret AUTH0_MANAGEMENT_CLIENT_SECRET
			resend-api-key RESEND_API_KEY
			r2-secret-access-key S3_SECRET_ACCESS_KEY
			proxy-secret PROXY_SECRET
			vapid-private-key VAPID_PRIVATE_KEY
			tick-heartbeat-url TICK_HEARTBEAT_URL
			vapid-public-key OLD_VAPID_PUBLIC_KEY
		EOF
		node -e '
			const { createECDH } = require("node:crypto");
			const ecdh = createECDH("prime256v1");
			ecdh.setPrivateKey(Buffer.from(process.env.VAPID_PRIVATE_KEY, "base64url"));
			if (ecdh.getPublicKey().toString("base64url") !== process.env.OLD_VAPID_PUBLIC_KEY) {
				console.error("vapid-public-key does not match vapid-private-key; nothing changed");
				process.exit(1);
			}
			const keys = process.argv.slice(1);
			process.stdout.write(JSON.stringify(Object.fromEntries(keys.map((k) => [k, process.env[k]]))));
		' $KEYS
	)
	printf %s "$json" | write
	unset json
	echo "$SECRET holds the eight values. Next: deploy, then retire the old secrets (accounts.md)."
	;;
*) usage ;;
esac
