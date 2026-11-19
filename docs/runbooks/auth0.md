# Runbook: Auth0 tenants

Sets up sign-in for Toe Beans (backlog S1.1, architecture §3.4, D5). There are two tenants, dev and prod, both in the **EU** region. A tenant's name and region can't be changed after creation, so check them before you confirm.

This file is public. It lists **variable names only**, never values.

| | Dev | Prod |
|---|---|---|
| Tenant name | `toe-beans-dev` | `toe-beans` |
| Environment tag | Development | Production |
| Issuer (`OIDC_ISSUER`) | `https://toe-beans-dev.eu.auth0.com/` | `https://auth.toebeans.co.za/` (custom domain, step 6) |
| App origins | `http://localhost:7877`, `http://localhost:3000` | `https://toebeans.co.za` |
| Secrets live in | your local `.env` | GCP Secret Manager |

Names follow the project convention: kebab-case words (`toe-beans`), not run together. Only the domain is `toebeans.co.za`.

## 1. Create the tenant

1. In the Auth0 dashboard, open the tenant menu (top left), choose **Create tenant**, enter the name, set the region to **EU** and the environment tag (see the table).
2. Under **Settings → Advanced**, check that **RP-Initiated Logout End Session Endpoint Discovery** is on. Sign-out depends on it (architecture §3.4).
3. Leave **Attack Protection** at its defaults (brute-force protection on).

## 2. Create the application

1. Go to **Applications → Create Application**, name it **Toe Beans** and choose **Regular Web Application**. The server is a confidential client, and no Auth0 SDK runs in the browser.
2. Under **Settings**:
   - **Allowed Callback URLs:** each app origin + `/auth/callback`. Dev: `http://localhost:7877/auth/callback, http://localhost:3000/auth/callback, https://toebeans.test:7877/auth/callback` (the dev server on the LAN, README). Prod: `https://toebeans.co.za/auth/callback`.
   - **Allowed Logout URLs:** each app origin + `/`. Dev: `http://localhost:7877/, http://localhost:3000/, https://toebeans.test:7877/`. Prod: `https://toebeans.co.za/`.
   - **Application Login URI:** prod `https://toebeans.co.za/auth/sign-in` (dev may leave it empty:
     Auth0 refuses `http` and `localhost`). Auth0's "email verified" and "password changed" pages
     use it for the button back to the app. The emails' *Redirect To* can't be changed on the free
     plan.
   - **Allowed Web Origins** and **Allowed Origins (CORS):** leave empty.
   - **Application Logo:** add once the PNG exports exist (S13.1).
3. Under **Credentials**, set the authentication method to **Client Secret (Basic)**.
4. Under **Advanced Settings → Grant Types**, tick only **Authorization Code**. Untick Implicit, Refresh Token and Client Credentials. The app keeps no tokens after sign-in.
5. Record `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET` (step 7).

## 3. Email and password connection

1. Under **Authentication → Database → Username-Password-Authentication**, turn on the **Toe Beans** application.
2. Keep sign-ups **enabled**, because invited caregivers create their own accounts. Set the password policy to **Good** or stronger.
3. Auth0 sends a verification email on sign-up. Email invites only accept a verified address (FR-01).

## 4. Google connection

1. Under **Authentication → Social → Google / Gmail**, turn the connection on for **Toe Beans**, with only the basic `email` and `profile` scopes.
2. **Dev:** Auth0's development keys are enough. The login page warns that they're in use, which is fine for dev.
3. **Prod:** create your own Google OAuth client, because the development keys aren't for production:
   - In the GCP project, under **APIs & Services → OAuth consent screen**, choose External, enter the app name *Toe Beans*, a support email and the `toebeans.co.za` domain, with only the basic scopes. Publish it, so sign-in isn't limited to listed test users.
   - Under **Credentials → Create OAuth client ID**, choose Web application. Set the authorised redirect URI to `https://auth.toebeans.co.za/login/callback`, the custom domain from step 6.
   - Paste the client ID and secret into the Auth0 Google connection.
   - **Published (S16.4, 19 Nov 2026).** In **Google Auth Platform → Branding**: home page
     `https://toebeans.co.za`, privacy policy `https://toebeans.co.za/privacy`, terms
     `https://toebeans.co.za/terms`, authorised domain `toebeans.co.za`. The domain is a **Domain
     property in Google Search Console**, verified by a `google-site-verification` TXT record on
     `@` in Cloudflare, under the same Google account as the project: keep that record, or
     verification lapses. Then **Audience → Publish app** (In production) and brand verification,
     so the consent screen shows the *Toe Beans* name and logo rather than only the domain. Google
     waits 24 hours after a domain is verified before it re-checks the branding. Changing the
     name, logo or links means verifying again.
4. Turn off every other connection for the application, so the login page shows only Google and email. This matters for security, not just looks: the app trusts the provider's `email_verified` claim to link accounts and to match email invitations (architecture D34, security audit C2), and Google and the database connection are the two that verify an address. Check it again on the prod tenant before the first real user, and before enabling any new connection.

## 5. Login page

1. Under **Branding → Universal Login**, use the current Universal Login experience.
2. **Branding (prod, S16.4)**, under **Customizations**, from `ui.md` §6.4's light theme. The login
   page has one set of colours, so it doesn't follow dark mode (the editor's light/dark switch is
   for the captcha only). The editor is on the free plan: an older tenant past its trial saves it.
   The editor shows a draft across tenants until saved, so check the real login page afterwards.

   | Section | Setting | Value |
   |---|---|---|
   | Colors | Primary button, links, focused components, base focus | `#8a4b1f` |
   | | Primary button label | `#ffffff` |
   | | Base hover | `#75401a` |
   | | Secondary button border, input border | `#94806f` |
   | | Secondary button label, header, body text, input filled text | `#2b1d14` |
   | | Input labels and placeholders, icons | `#6b5444` |
   | | Widget background, input background | `#ffffff` |
   | | Widget border | `#e6d8c6` |
   | | Error | `#b3261e` |
   | | Success | `#1e5b2e` |
   | Fonts | Font URL | `https://fonts.gstatic.com/s/nunito/v32/XRXV3I6Li01BKofINeaB.woff2` |
   | | Title, buttons | Bold |
   | Borders | Buttons | Pill |
   | | Input style, radius | Rounded, 10 px (the editor's maximum; the app uses 12) |
   | | Widget corner radius, border weight | 16 px, 1 px; no shadow |
   | Widget | Logo URL, height | `https://toebeans.co.za/icons/icon-512.png`, 52 px |
   | Branding | Favicon URL | `https://toebeans.co.za/icons/icon-192.png` (the app's own favicon is inlined, so it has no URL) |
   | Page background | Colour | `#fffbf5` |

   The font is Nunito's Latin file from Google Fonts, which allows other sites to load it; the
   privacy policy lists Google Fonts for this (§4 there). If Google ever retires that URL, get the
   current one from `https://fonts.googleapis.com/css2?family=Nunito:wght@200..1000` (the
   `/* latin */` block). Fredoka, the app's heading font, can't come too: the theme takes one font.
3. **Privacy and terms links.** The free plan doesn't offer custom sign-up prompts ("Customize
   Signup & Login" is paid), so the login page has no links of its own. The app's sign-in page
   links to both just before handing over, which is where people agree (S16.4).
4. **Names and addresses (prod).** **Settings → General**: Friendly Name `Toe Beans` (the login
   page's "Log in to … to continue to …" and Auth0's emails use it, and it otherwise shows the
   tenant ID), Support Email `support@toebeans.co.za`. **Branding → Email Provider**: From
   `Toe Beans <support@toebeans.co.za>`, so replies to verification and password emails reach the
   owner. Optionally, under the prompts' **Custom Text**, the login and sign-up descriptions read
   "Log in to continue to Toe Beans." and "Sign up to continue to Toe Beans."

## 6. Prod only: custom domain and email

The custom domain must be in place **before the first real user signs in**. Users are keyed by issuer, and the issuer changes with the domain (architecture §3.4).

1. Under **Settings → Custom Domains**, add a card when asked. The free plan includes one custom domain, and the card is only verified, not charged.
2. Add `auth.toebeans.co.za` with **Auth0-managed certificates**.
3. In Cloudflare DNS for `toebeans.co.za`, add the CNAME that Auth0 shows, set to **DNS only** (grey cloud). If Cloudflare proxies it, Auth0's certificate validation fails.
4. Click **Verify** and wait until the domain shows *Ready*.
5. Turn on **Use Custom Domain in Emails**, then check that `https://auth.toebeans.co.za/.well-known/openid-configuration` shows that issuer.
6. Under **Branding → Email Provider**, set up a real sender for the verification and password-reset emails. Auth0's built-in provider is for testing only. Use Resend over SMTP (D11), with a verified `toebeans.co.za` sender.

## 7. Configure the app

| Variable | Dev (`.env`) | Prod |
|---|---|---|
| `OIDC_ISSUER` | the dev issuer from the table above | Cloud Run env var |
| `OIDC_CLIENT_ID` | from step 2 | Cloud Run env var |
| `OIDC_CLIENT_SECRET` | from step 2 | Secret Manager, mounted by Cloud Run (D15) |
| `PUBLIC_BASE_URL` | `http://localhost:7877` | `https://toebeans.co.za` |

Never commit the dev client secret. `.env` is gitignored, and `.env.example` holds only placeholders.

## 8. Account deletion: a machine-to-machine application

Deleting a Toe Beans account deletes the person's Auth0 users too (backlog S16.5, architecture
D38): Auth0 keeps their email, name and, for email sign-ins, a password hash. The app does it
through the Management API, with an application that can do nothing else.

1. Under **Applications → Applications**, choose **Create Application**, name it
   `Toe Beans account deletion`, and pick **Machine to Machine Applications**.
2. Authorise it for the **Auth0 Management API** with the **`delete:users`** permission only.
   Nothing to read users, nothing to create or update them.
3. From its **Settings**, take the client ID and secret.
4. Set them:

| Variable | Dev (`.env`) | Prod |
|---|---|---|
| `AUTH0_DOMAIN` | `toe-beans-dev.eu.auth0.com` | `toe-beans.eu.auth0.com`, set in the Deploy workflow. The tenant's own domain: the Management API isn't on the custom domain |
| `AUTH0_MANAGEMENT_CLIENT_ID` | from step 3 | the `production` environment variable in GitHub |
| `AUTH0_MANAGEMENT_CLIENT_SECRET` | from step 3 | Secret Manager `auth0-management-client-secret` (`infra/gcp/set-secret.sh`) |

Prod refuses to start without all three, so set them **before** the release that brings S16.5
reaches `main`. Re-run `infra/gcp/provision.sh` first if the secret doesn't exist yet.

A machine-to-machine token counts against the free plan's monthly quota; the app keeps each one
for its 24 hours, so a deletion costs at most one.

**Rotating:** in the application's **Credentials**, **Rotate** the secret, set the new one and
redeploy. Nothing else uses it.

**If a deletion fails at Auth0,** the app deletes nothing of its own and tells the person to try
again; the log says `could not delete the provider accounts` with the status, and Sentry gets it.

## Checking it works

- Sign in with Google and with a new email/password account on `http://localhost:7877`. Each should land back in the app, signed in.
- Sign out. The next sign-in should show the Auth0 login page again instead of signing you straight back in.
- In prod, check that the login page is served from `auth.toebeans.co.za`.
- Auth0's built-in email provider (dev) may never reach some mailboxes: Yahoo dropped its
  verification mail without a trace, while Gmail got it. Test with Gmail (a `+tag` address makes
  throwaways), or give the tenant a real provider as in §6.
- With §8 set up, sign in as a throwaway email/password account, delete it from *More*, and check
  the user is gone from **User Management → Users**.

## Rotating the client secret

Under **Applications → Toe Beans → Credentials**, choose **Rotate**, then update `.env` or the Secret Manager version, and redeploy. Signed-in users keep their sessions, because sessions don't depend on the client secret.
