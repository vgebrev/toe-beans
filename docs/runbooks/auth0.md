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
   - **Allowed Callback URLs:** each app origin + `/auth/callback`. Dev: `http://localhost:7877/auth/callback, http://localhost:3000/auth/callback`. Prod: `https://toebeans.co.za/auth/callback`.
   - **Allowed Logout URLs:** each app origin + `/`. Dev: `http://localhost:7877/, http://localhost:3000/`. Prod: `https://toebeans.co.za/`.
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
4. Turn off every other connection for the application, so the login page shows only Google and email.

## 5. Login page

1. Under **Branding → Universal Login**, use the current Universal Login experience.
2. Optional for now: brand colours and logo from `ui.md` §6.4. S13 polishes these.

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

## Checking it works

- Sign in with Google and with a new email/password account on `http://localhost:7877`. Each should land back in the app, signed in.
- Sign out. The next sign-in should show the Auth0 login page again instead of signing you straight back in.
- In prod, check that the login page is served from `auth.toebeans.co.za`.

## Rotating the client secret

Under **Applications → Toe Beans → Credentials**, choose **Rotate**, then update `.env` or the Secret Manager version, and redeploy. Signed-in users keep their sessions, because sessions don't depend on the client secret.
