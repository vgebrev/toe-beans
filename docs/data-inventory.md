# Toe Beans — Data inventory

**Version:** 0.6 (draft)
**Date:** 20 November 2026
**Inputs:** `docs/requirements.md` v1.0, `docs/architecture.md` v1.34, `docs/runbooks/accounts.md`

**Changes in 0.1:** first draft for backlog S16.1. Lists the personal data Toe Beans holds, where it is, why, and how long it's kept, worked out from the code and the accounts inventory. It's the source for the privacy policy (S16.2) and for deletion (S16.5). §6 lists the open points those slices have to settle.

**Changes in 0.2:** S16.5 built (architecture D38), settling §6's points 1–4: deleting an account deletes the person's Auth0 users, devices, reminder settings, ledger entries, sessions and user; what they recorded in a shared household stays as from "a former member"; a household is deleted by its only member, with its only member's account, or 30 days after the last person left. §2's *Kept* column and §4's Auth0 row follow.

**Changes in 0.3:** the privacy contact (S16.2): mail to `privacy@toebeans.co.za` is forwarded by Cloudflare Email Routing to the owner's Gmail, and replies go out through Resend. §4 gains the row, and §6 point 9 settles how long that correspondence is kept: a year after it's answered.

**Changes in 0.4:** Auth0's login page (`auth.toebeans.co.za`) loads the Nunito font from Google Fonts, so §4 gains Google Fonts. The app itself still loads nothing from other sites. The Gmail row covers `support@toebeans.co.za` too: invitations carry it as their reply address, and Auth0's emails come from it.

**Changes in 0.5:** §3, error reports: the browser's reports now reach Sentry through the app's own server (architecture 1.32 D41), so Sentry no longer receives the phone's address at all.

**Changes in 0.6:** §2, `pushDevices` (architecture 1.34 D43): a device is removed when the person signs out in that browser, and deleted 30 days after it was last used or 14 days after the push service reported it gone, so an uninstalled or lost phone no longer stays on file indefinitely. It also records when the app last opened on it.

This file is public. It describes kinds of data and where they are, never values. It isn't legal
advice. The owner has it read with the policy before other households join (backlog S16).

## 1. Roles

- **Responsible party** (POPIA §1): the owner, who runs Toe Beans as an individual. The Information
  Officer is the owner too, once registered (S16.6).
- **Data subjects:** caregivers who sign in, and people invited by email who haven't joined yet.
  Dogs aren't data subjects, but a dog's records say things about its household: names, routines,
  notes, and photos that may show people or homes.
- **Operators** (POPIA §20–21, *processors* in GDPR terms): the services in §4, each under its own
  terms of service and data processing terms.

## 2. What the app stores (MongoDB Atlas, Cape Town)

Everything here is in the `toe-beans` database on Atlas, AWS `af-south-1`. "Household" means only
that household's members can reach it (NFR-01, NFR-02).

| Collection | Personal data | Whose, who sees it | Why | Kept |
|---|---|---|---|---|
| `users` | Email, display name, avatar URL (from Google), the provider's subject IDs, when each was linked | The person. Fellow members see the name and avatar | Sign-in, linking Google and email sign-ins by verified email, showing who did what | Until the person deletes their account (D38). Leaving a household doesn't remove it |
| `households` | Household name, time zone, members (user ID, role, joined date) | Members | Sharing dogs between caregivers; reminders in local time | While it has members. The last to leave deactivates it (D18); it's deleted with everything in it when its only member deletes it or their account, or 30 days after it was deactivated (D38) |
| `invitations` | The invitee's email (email invitations only), who invited, expiry and use. The token is stored only as a hash | The household's members | Inviting a caregiver (FR-02) | 7 days to use, then removed 30 days after it expires (TTL) |
| `dogs` | Name, birth date, adoption date, notes, the photo's ID | Household | The dog's profile | Until its household is deleted (D38). Archiving keeps it |
| `sessionLogs`, `behaviourEvents` | What was practised or happened, when, notes, emotional state, environment, who recorded it and who changed it last | Household | Training history and reports (FR-05–FR-09) | Until deleted. A deleted entry is purged 30 days later (TTL) |
| `plannedSessions`, `trainingPlans` | Planned times, who planned them | Household | Planning and reminders (FR-04, FR-12) | Until deleted |
| `careTasks` | Care titles, dates, notes, history of changes and who made them | Household | Care tracking and reminders (FR-10, FR-11) | Until deleted. History is capped per task |
| `cues` | Cue words and notes | Household | The shared cue dictionary | Until deleted |
| `pushDevices` | The browser's push endpoint and keys, a label such as "Galaxy S23 FE · Chrome", when the app last opened on it, last success and failures | The person | Sending reminders to that phone (FR-12) | Until the person removes it, signs out on it or everywhere, or deletes their account; otherwise 30 days after the app last opened on it or it last took a reminder (TTL), or 14 days after the push service reported it gone (D43) |
| `reminderPreferences` | What the person wants reminding of, and when | The person | Reminders | Until the account is deleted (D38) |
| `reminders` | Ledger of reminders: whose, for which item, when due, sent or failed | The person; the tick | Not sending a reminder twice (D27) | 30 days from creation (TTL), or sooner with the account or household |
| `sessions` | The user ID, a hash of the cookie's token, created and expiry times | The person | Staying signed in | 90 days sliding, at most 400 days, then removed (TTL). Never backed up |
| `pendingSignIns` | PKCE checks and the page to return to, for 10 minutes | Nobody | Finishing a sign-in | 10 minutes (TTL). Never backed up |
| `_migrations`, `_locks` | None | — | Running the app | — |

The rate limiter keys on the client's address in process memory only, and forgets it on restart
(architecture §7). Neither the app's logs nor Sentry receive the address.

## 3. Outside the database

| What | Where | Personal data | Kept |
|---|---|---|---|
| Dog photos | Cloudflare R2 `toe-beans-photos`, Europe location hint | The image, re-encoded with its metadata (EXIF, location) removed (S3) | Until replaced, or its household is deleted (D38) |
| Backups | R2 `toe-beans-backups`, Europe. The dump is encrypted with `age` to the owner's key | Everything in §2 except `sessions` and `pendingSignIns`, plus every photo | Dumps 30 days; replaced or deleted photos 30 days in `photos/replaced/`; current photos while they exist (D36) |
| App logs | Google Cloud Logging, project `toe-beans-co-za` | Internal user, household and item IDs, route IDs and errors. Emails, tokens, cookies and push endpoints are redacted (NFR-12) | 30 days |
| Platform request logs | Cloud Logging (Cloud Run request logs) | Full URLs (which can hold an invitation token, D34), user agent, timing | 30 days, readable by the owner only |
| Error reports | Sentry, EU (Frankfurt) | Stack traces and scrubbed messages. Request, user, cookies, headers and IP are dropped before sending. The browser's reports go through the app's server, which passes on nothing about the phone's request, so Sentry never sees its address, and storing IPs is also blocked by a project setting | 30 days (free plan) |
| In the browser | The phone | The session cookie (`__Host-` prefixed, HTTP-only), a sign-in cookie for 10 minutes, `localStorage` for theme, banners dismissed and the active dog, and the service worker's cache of the app and photos | Until signed out, cleared or uninstalled |

## 4. Operators and transfers abroad

POPIA §72 allows personal data to leave South Africa to a country, or under a binding agreement,
with protection substantially similar to POPIA. The EU's GDPR is accepted as that (architecture
§3.4). "Data" here means personal data only.

| Operator | What it gets | Where | §72 basis | Its retention |
|---|---|---|---|---|
| MongoDB Atlas | §2 | South Africa (Cape Town) | Not a transfer | As §2 |
| Auth0 (Okta) | Email, name, avatar URL, password hash for email sign-in, sign-in logs with IP and device | EU | GDPR-adequate region; Okta's DPA | Account until the person deletes theirs in the app, which deletes it at Auth0 too (D38). Logs 1 day (free plan) |
| Google | For Google sign-in: that the person signed in to Toe Beans. Google's OAuth client is the owner's | US and global | The person chooses Google sign-in and has their own account with Google | Google's own |
| Cloudflare | Every request passes the edge: address, URL, user agent. R2 holds photos and backups. Worker logs are off | Global edge; R2 in Europe | EU storage; Cloudflare's DPA with SCCs for the edge | Request analytics are aggregate. Security events (S17.3's WAF rule) keep addresses for 30 days |
| Google Cloud | Runs the app. Sees requests and holds logs (§3) and secrets | South Africa (`africa-south1`); Scheduler in `me-central1` carries no personal data | Not a transfer for the app and its logs | 30 days for logs |
| The owner's Gmail, through Cloudflare Email Routing (in) and Resend (out) | Mail to and from `privacy@toebeans.co.za` and `support@toebeans.co.za` (where replies to invitations and Auth0's emails go): the sender's address and whatever they write, such as a request to see or delete their data. Cloudflare forwards it without keeping it | Google: US and global; Resend: EU | The person chooses to write to us | A year after the request is answered, then deleted by the owner |
| Google Fonts | The address and user agent of whoever opens Auth0's login page, which loads its font from `fonts.gstatic.com`. No cookies | Global | Only technical data, needed to serve the file; Google's terms | Google's own |
| Resend | Invitation emails: the invitee's address, the inviter's name, household name and link. Auth0's verification and password emails: the person's address | EU: the domain sends from Ireland (`eu-west-1`) | GDPR-adequate region | Email logs 30 days |
| Sentry | §3 | EU | GDPR-adequate region | 30 days |
| Web push services (Google FCM for Chrome) | The endpoint, and each reminder encrypted end to end, so the service can't read it | Global | Chosen by the browser, not the app; the content is encrypted | Undelivered messages until the reminder's TTL |
| GitHub | No personal data. Backups run there, but the dump goes straight to R2 encrypted and the log names no objects and counts nothing | US | — | — |
| Better Stack | No personal data: it calls `/readyz` and receives heartbeats | EU and US | — | — |

## 5. What Toe Beans doesn't collect

No analytics or tracking, no advertising, no location, no contacts, no cookies beyond the
essential two (so no consent banner, S16.2), and no data from other apps. Exercise content is
the curated library, not personal data. Push notifications show only what the household entered
(a dog's name, an exercise, a care task).

## 6. Open points for S16.2 and S16.5

1. **Deleting an account** — settled by S16.5 (D38): *More → Delete account* deletes the Auth0
   users, devices, reminder settings, ledger entries, sessions and the user.
2. **Deleting a household** — settled (D38): by its only member, with its only member's account,
   or by the tick 30 days after the last person left. Photos and every document with its ID go;
   other households aren't touched.
3. **Who-did-what after someone leaves** — settled (D38): records keep the deleted person's ID,
   which names nobody once the user is gone, and show "a former member".
4. **Disabled push devices** — settled: they go with the account, or when the person removes
   them or signs out everywhere. No separate clean-up.
5. **Backups** keep deleted data for up to 30 days. The policy says so (D36).
6. **Resend's region** is settled: the domain sends from Ireland (`eu-west-1`), so it's in the EU
   like Auth0 and Sentry.
7. **Retention at the operators** is confirmed by the owner: Auth0's logs 1 day, Resend's email
   logs 30 days, Cloudflare's security events 30 days.
8. **Invitees who never join.** Their address is in `invitations` for up to 37 days and was sent
   through Resend. The policy names this, since they never agreed to anything.
9. **Privacy correspondence** — settled: it sits in the owner's Gmail, outside South Africa, and
   is deleted a year after the request is answered, long enough to show it was handled. The
   policy says so (§4, §5).
