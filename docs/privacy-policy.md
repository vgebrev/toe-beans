# Toe Beans — Privacy policy

**Version:** 0.7 (reviewed draft)
**Date:** 23 November 2026
**Inputs:** `docs/data-inventory.md` v0.9, `docs/architecture.md` v1.35 (D36, D38, D39, D43)

**Changes in 0.1:** first draft for backlog S16.2, written from the data inventory. S16.4 publishes
the text below the line at `/privacy`. The owner reviews it, and fills in the points marked
**[OWNER]**, before other households join.

**Changes in 0.2:** reviewed by the owner. "Device" rather than "phone", as the app also runs in
desktop browsers; §9 says how the data is kept safe, including encryption at rest at the operators
that store it (checked against their documentation). §1 has the postal address and says the owner
is registered with the Information Regulator as Information Officer, with the registration
number (S16.6). §5's column reads
"How long", as the published page shows each row as a card. The page's "Last updated" is
**Date** above (S16.4). Emails to `privacy@` are kept in the owner's Gmail for a year after
they're answered (§4, §5; data inventory 0.3).

**Changes in 0.3:** the sign-in page at `auth.toebeans.co.za` loads its font from Google Fonts,
so §4 lists Google Fonts and what it sees (data inventory 0.4). The Gmail row covers
`support@toebeans.co.za` too, where replies to invitations and Auth0's emails now go.

**Changes in 0.4:** §5 gains how long a device's reminder registration is kept: until reminders
are turned off on it or you sign out there, and otherwise 30 days after it was last used, or 14
after it stopped accepting reminders (data inventory 0.6, architecture D43).

**Changes in 0.5:** §5: signing out no longer removes a device's registration; reminders pause
until you sign in there again (data inventory 0.7, architecture 1.35 D43).

**Changes in 0.6:** §2's account row gains the record of which terms you accepted and when, with the confirmation that you're 18 or older (data inventory 0.8, architecture D47).

**Changes in 0.7:** §4 no longer lists Google Fonts: the sign-in page's font now comes from
`toebeans.co.za` (backlog S19.2, data inventory 0.9).

Before publishing:

1. **`privacy@toebeans.co.za`** receives mail in the owner's Gmail and sends through Resend
   (`docs/runbooks/accounts.md`). That correspondence is kept a year after it's answered (§4, §5).
2. **Minimum age 18.** This keeps children's personal information out (POPIA §34–35). The terms say
   the same.
3. It isn't legal advice. Have it read before relying on it, as `data-inventory.md` says.

---

# Privacy policy

Toe Beans is an app for training and caring for a puppy together with the people you share it with.
This policy says what personal information Toe Beans holds about you, why, where it's kept, for how
long, and what you can ask of us. It's written for South Africa's Protection of Personal
Information Act (POPIA).

## 1. Who we are

Toe Beans is run by Veli Gebrev, an individual in South Africa ("we", "us"). We are the
*responsible party* for your personal information under POPIA, and also its Information Officer,
registered with the Information Regulator (registration number 2026-072618).

- **Email:** privacy@toebeans.co.za
- **Post:** PO Box 2973, Cresta 2118, South Africa

Write to us with any question about this policy or your information.

## 2. What we collect, and why

You give us all of it, except what your sign-in provider passes on and what your browser sends.

| What | Why |
|---|---|
| **Your account:** your email address, your name, and, if you sign in with Google, your profile picture's address. We also keep an ID from the sign-in service for each way you sign in, and which version of the terms you accepted, confirming you're 18 or older, and when | So you can sign in, and your household can see who did what; the terms record shows what you agreed to |
| **Your household:** its name, time zone and members, with each member's role and the date they joined | So you can share your dogs with the people you choose, and get reminders at the right local time |
| **Your dogs:** names, dates of birth and adoption, notes and a photo each | Your dogs' profiles |
| **Training and care records:** sessions and how they went, behaviour, plans, care tasks, cue words and notes, with who recorded or changed each one | The point of the app: a shared history and plan for each dog |
| **Invitations:** the email address of someone you invite, who invited them and when it expires | So they can join your household |
| **Reminders:** what you want reminding of and when, each device you've turned reminders on for (the browser's push address and a label such as "Galaxy S23 FE · Chrome"), and a record of each reminder sent | So reminders reach your device, and none arrives twice |
| **Sign-in sessions:** a random token in a cookie, of which we keep only a scrambled copy (a hash) | So you stay signed in |
| **Technical logs:** what was asked of the app and when, errors, and internal ID numbers. Our hosting also logs each request's address and browser | To keep the app running and secure, and to fix faults |

Photos are re-encoded when you upload them, which strips their hidden details such as where they
were taken.

Your account details, household and dogs are needed for the app to work: without them you can't
use it. Everything else you add is up to you. Please don't put information about other people's
health, beliefs or similar sensitive matters in notes, as the app doesn't need it.

**What we don't collect:** no analytics or tracking, no advertising, no location, no contacts, and
nothing from your other apps. We don't sell or rent your information, we don't use it for
marketing, and no decision about you is made by a computer alone.

**If you were invited but haven't joined,** we hold your email address because a household member
gave it to us to invite you. It's used only to send that one invitation, and it's deleted within
37 days if you don't join (§5).

POPIA allows this processing because it's needed to provide the app you've signed up for
(§11(1)(b)), and, for logs and security, because it's in the legitimate interest of keeping the app
safe and working (§11(1)(f)).

## 3. Who can see it

- **Your household's members** see the household, its dogs and all their records, including who
  recorded what, and your name and picture. Nobody outside your household can.
- **We** can reach the stored data to run and repair the app, and look at it only for that or when
  you ask us to.
- **The services that run Toe Beans for us** (§4) store or carry it on our behalf. Each is bound by
  its terms to use it only to provide its service.
- **Anyone else** only when the law requires it.

Reminders show your dog's name and the task as a notification, which anyone looking at your
screen, or a phone's lock screen, can see.

## 4. Where it's kept, and who processes it

Your household's data is stored in **South Africa** (MongoDB Atlas in Cape Town, and the app runs
on Google Cloud in Johannesburg). Some services that run Toe Beans are outside South Africa. POPIA
§72 allows that where the country's laws, or binding agreements, protect personal information
substantially as POPIA does. The European Union's GDPR does, so we've chosen services in the EU
where we can.

| Service | What it does with your information | Where |
|---|---|---|
| MongoDB Atlas | Stores the app's data | South Africa |
| Google Cloud | Runs the app and keeps its logs | South Africa |
| Auth0 (Okta) | Signs you in. Holds your email, name and picture, and your password (scrambled) if you sign in with email | EU |
| Cloudflare | Carries every request to the app, protects it from attacks, and stores dog photos and our backups | Photos and backups in the EU; requests pass through Cloudflare's nearest location, usually Johannesburg |
| Resend | Sends invitation emails, and the sign-in service's verification and password emails | EU (Ireland) |
| Sentry | Receives error reports with personal details removed | EU (Germany) |
| Your browser's push service (Google's, for Chrome) | Delivers reminders. Each one is encrypted so the service can't read it | Worldwide |
| Google (Gmail) | Holds the emails you send us, at privacy@toebeans.co.za or support@toebeans.co.za, and our replies (§5) | Worldwide |
| Google | If you choose to sign in with Google, Google knows you signed in to Toe Beans, under Google's own privacy policy | Worldwide |

**Google sign-in.** We receive only your name, email address and profile picture from Google, and
use them only to sign you in and show your name to your household. Toe Beans's use of information
received from Google APIs follows the
[Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy),
including the Limited Use requirements.

## 5. How long we keep it

| What | How long |
|---|---|
| Your account | Until you delete it |
| A household, its dogs, photos and records | Until its last member deletes it, or 30 days after the last member left it |
| Something you delete in the app | Removed straight away, except training sessions and behaviour entries, which are kept hidden for 30 days, then removed |
| Invitations | 7 days to use, then removed 30 days after they expire |
| Devices you get reminders on | Until you turn reminders off there or remove the device. While you're signed out on it, nothing is sent to it. One not used for 30 days, or that stopped accepting reminders 14 days ago (as when the app is uninstalled), is removed |
| Reminder records | 30 days |
| Sign-in sessions | 90 days after you last used the app, never more than 400 days |
| Logs and error reports | 30 days |
| Sign-in logs at Auth0 | 1 day |
| Emails' delivery logs at Resend | 30 days |
| Emails you send us | A year after we've answered, then deleted |
| Backups | 30 days (see below) |

**Backups.** We back the app's data and photos up every night, encrypted so that only we can read
them, and keep each backup for 30 days. Anything you delete stays in backups for up to 30 days
before it's gone for good. We use backups only to recover from a fault.

## 6. Deleting your information

- **Your account:** *More → Delete account*. This deletes your account here and at Auth0, your
  reminder settings and devices, and signs you out everywhere. If you share a household, you leave
  it: the others keep the dogs and their history, and what you recorded shows as from "a former
  member", with nothing left that identifies you. A household nobody else is in is deleted with
  your account.
- **A household:** if you're its only member, *Household → Delete household* deletes it with its
  dogs, photos and history. If you leave it last, you can bring it back or delete it for 30 days;
  after that it's deleted for you.

## 7. Your rights

Under POPIA you can:

- **ask** whether we hold information about you, and for a copy of it;
- **correct** it. You can change your name in the app, and anything your household recorded;
- **delete** it (§6), or ask us to;
- **object** to how we use it;
- **complain** to the Information Regulator (South Africa) at
  [inforegulator.org.za](https://inforegulator.org.za).

To ask, write to privacy@toebeans.co.za from the address on your account. We'll answer within 30
days, free of charge. Please tell us first if something is wrong, so we can put it right.

## 8. Cookies and storage on your device

Toe Beans uses only what it needs to work, so it doesn't ask you to accept cookies.

- **Cookies:** one keeps you signed in, and another lasts 10 minutes while you sign in. Auth0 sets
  its own cookies on `auth.toebeans.co.za` to sign you in and to protect accounts from attacks.
  Cloudflare may set a cookie to tell people from automated attacks.
- **On your device:** the app remembers your light or dark choice, the dog you last chose, and
  which tips you've closed. It also keeps a copy of itself and of photos, so it opens quickly. All
  of it stays on your device, and goes when you clear the app's data or uninstall it.

## 9. Keeping it safe

We follow established security practice in how Toe Beans is built and run:

- **Only your household.** Our server checks every request, photos included, so only your
  household's members can reach its information.
- **Encrypted in transit.** Every connection to Toe Beans, and between the services behind it, is
  encrypted.
- **Encrypted at rest.** The database, photos and the sign-in service's records are stored
  encrypted (AES-256). Backups are also encrypted with a key only we hold, before they're stored.
- **Little to steal.** Passwords are handled by Auth0 and never reach us. Sign-in and invitation
  tokens are stored only scrambled. Logs and error reports leave out emails, tokens and the like.
- **Few people, strong sign-in.** Only we can reach the services behind Toe Beans, each protected
  by two-factor sign-in, and each part of the app gets only the access it needs.
- **Kept up to date.** We review the app's security, keep its software patched, and watch for
  faults and attacks.

If your personal information is ever compromised, we'll tell you and the Information Regulator as
POPIA requires.

## 10. Changes to this policy

When this policy changes, we'll update the date at the top. If a change affects what we do with
your information, we'll tell you in the app or by email before it takes effect.
