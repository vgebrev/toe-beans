# Runbook: Disaster recovery and breach response

What to do when something big goes wrong with prod: an account lost, a credential leaked, a
provider gone, or personal data exposed (backlog S16.7; POPIA §19 and §22; NFR-10). Restoring data
is `restore.md`; an alert from monitoring is `monitoring.md` §5. This file is public. It names
accounts and steps, never values, and holds nothing that would help an attacker.

| | |
|---|---|
| Most data you can lose | A day: everything since the last nightly backup (D36) |
| Time to recover | Best effort, by one person: hours for a restore, a day or more for a lost provider |
| Who acts | The owner. If the owner can't, the trusted person in §4 |
| What's needed | The password manager: logins, two-factor recovery codes, the backup key (§5) |

## 1. Scenarios

Work through the first steps, then the linked runbook. Afterwards, add a line to §6.

| What happened | Signs | First steps | Then |
|---|---|---|---|
| **The app is down** | Better Stack's uptime alert, people telling you | Check Cloud Run, the Worker and Atlas status pages | `monitoring.md` §5 |
| **Data lost or corrupted** (a bad migration, a mistaken delete) | Missing dogs or history, errors in Sentry | Pause the tick so reminders don't fire from bad data | `restore.md` §5 |
| **The Atlas cluster is gone** | `/readyz` failing on the database | As above | `restore.md` §6 |
| **Photos lost** | Broken photos everywhere | Check the bucket in the Cloudflare dashboard | `restore.md` §5 step 3 |
| **A credential leaked** (in a log, a screenshot, a commit) | Secret scanning mail from GitHub, a provider's alert, or you notice | Rotate it now, before anything else | `accounts.md`, *Credentials*: each row says how. Then check the service's access log. If personal data may have been read, go to §2 |
| **Locked out of an account** (lost phone, lost two-factor) | You can't sign in | Use the account's recovery codes from the password manager | The provider's own account recovery. If it's the Google account, see below |
| **An account suspended or a provider shutting down** | Mail from the provider, the service stopping | Take a fresh backup by hand (`infra/backup/README.md`, *Running it by hand*) while it still works | §3 |
| **The domain lapsing** | Renewal mail from GoDaddy; the site gone | Renew it at GoDaddy. A lapsed `.co.za` can be renewed for a while before anyone else can register it | Check DNS still points at Cloudflare |
| **The backup key lost** | You can't decrypt a dump | Make a new key and take a backup straight away (`infra/backup/README.md` §1) | Backups made before are unreadable: 30 days with no backup to fall back on |
| **Personal data exposed** | Any of the above, or someone tells you | §2 | §2 |

**The owner's Google account is the root.** It holds GCP (the app, logs, secrets), the Google
OAuth client and the Gmail behind `privacy@toebeans.co.za`. Keep two-factor on with more than one
method (passkey, authenticator, recovery codes), and its recovery email and phone current. Losing
it means Google's account recovery before anything else can be fixed.

## 2. A personal data breach

POPIA §22: when there are reasonable grounds to believe someone unauthorised has reached personal
information, tell the Information Regulator and the people affected **as soon as reasonably
possible** after finding out. The data inventory (`docs/data-inventory.md`) says what's where.

1. **Contain it.** Rotate the credentials involved (`accounts.md`). If the app itself is the way
   in, take it offline: remove the Worker's route in Cloudflare. The app refuses requests without
   the Worker's header secret (D32), so that closes it.
   Keep the evidence: don't delete logs (Cloud Logging keeps 30 days; export what matters).
2. **Work out what was reached.** Which collections, photos or backups, whose, and over what
   period. Access logs: Atlas, GCP audit logs, Cloudflare, Auth0. Write it down as you go, with
   times.
3. **Tell the Information Regulator** on its security compromise form (see
   [inforegulator.org.za](https://inforegulator.org.za)), as Information Officer, with the
   registration number from the policy (§1 there). Say what happened, what was reached, whose,
   what you've done, and what people should do.
4. **Tell the people affected** by email to their account address, from `privacy@toebeans.co.za`
   (template below). If you can't reach everyone, say so on the sign-in page too. Leave out what
   would help the attacker.
5. **Fix the cause**, then record it in §6, and change the docs that need it (the security audit,
   the architecture's decision log).

**Notice template** (POPIA §22(5) asks for each of these):

> Subject: Toe Beans: your information may have been exposed
>
> On [date] we found that [what happened, in plain words]. It may have exposed [what: your email
> address, your household's dog records, photos…] between [start] and [end].
>
> What it could mean for you: [the possible consequences, e.g. phishing emails using your
> household's name].
>
> What we've done: [contained it how; fixed what; told the Information Regulator].
>
> What you can do: [e.g. be wary of emails asking you to sign in; change your password if you
> sign in with email].
>
> [If known: who reached it.]
>
> Questions: reply to this email, or write to privacy@toebeans.co.za.

## 3. Moving off a provider

Each piece can move. Do it before the old one stops, when there's notice.

| Provider | Moves to | Notes |
|---|---|---|
| MongoDB Atlas | Another Atlas project, or MongoDB as a replica set on any host | `restore.md` §6, with the new connection string |
| Google Cloud Run | Any host that runs the image (`docker/compose.yaml`, profile `app`), behind the IIS reverse proxy (NFR-07) | The tick then runs in-process (`WORKER_MODE`), or from any scheduler calling `/internal/tick` |
| Cloudflare R2 | Any S3-compatible store (`PHOTO_STORE=s3`) | Copy `photos/current/` from the backups bucket |
| Cloudflare (DNS, Worker) | DNS at the registrar; the app's own HTTPS on a self-hosted proxy | Cloud Run needs the Worker for the custom domain in `africa-south1` (architecture §8.4), so leaving Cloudflare means leaving Cloud Run too |
| Auth0 | Another OIDC provider (`OIDC_ISSUER`) | Users are found by identity, then by verified email (architecture §3.4), so people sign in again with the same email and keep their accounts. Passwords don't move: email users set a new one |
| Resend | Another sender behind the email port (`EMAIL_SENDER`) | Auth0's email provider and the `privacy@` replies move with it |
| GitHub | Another git host; CI and backups as scripts run elsewhere | `infra/backup/backup.sh` runs anywhere |

## 4. If the owner can't act

Toe Beans is run by one person, so a trusted person needs enough to keep promises to its users:
the terms promise 30 days' notice before Toe Beans closes, with a copy of a household's data on
request.

- **The private part (§5)** says who that person is and how they reach the password manager's
  emergency access.
- **What they do:** keep it running if it's running (nothing needs doing day to day: the tick,
  backups and monitoring run themselves), answer `privacy@`, and if it has to close, email every
  user with 30 days' notice, then delete the GCP project, the Atlas cluster, the R2 buckets and the
  Auth0 tenant, and let the domain lapse.

## 5. The private part

Kept in the owner's password manager, **never in this repo**, and reviewed with §7:

- Every account's login and two-factor recovery codes (`accounts.md` lists the accounts).
- Where the backup key is (the password manager entry, the offline copy).
- The domain's renewal date and that auto-renew is on.
- The trusted person (§4): who, how they get emergency access, and a short note of what to do.
- The Information Regulator registration certificate.

## 6. Log

| Date | What happened | What was done |
|---|---|---|
| — | Nothing yet | — |

## 7. Review

Quarterly, with the account review (`accounts.md`, *Reviews*): read this file against the
accounts, check the recovery codes and emergency access in §5 still work, and check the domain's
renewal.
