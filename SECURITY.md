# Security policy

Toe Beans is a small app run by one person. Reports are welcome and read, but there is no bug
bounty.

## Reporting a vulnerability

Report it privately through GitHub: the repository's **Security** tab → **Report a
vulnerability**. Please don't open a public issue or pull request for it.

Say what you found, how to reproduce it, and what someone could do with it. You'll get a reply
within a week, and a fix as soon as it can be made. If you'd like credit, say how you'd like to be
named; it goes in the security audit (`docs/security-audit.md`) once the fix is live.

## Scope

In scope: the app at `https://toebeans.co.za` and this repository, its workflows and releases.

When testing, use accounts and households you created yourself. Don't access, change or delete
anyone else's data, and stop and report as soon as you can reach it.

Out of scope:

- Floods, load tests or anything else meant to slow the service or use up its quotas.
- Social engineering, phishing, or attacks on the owner's accounts and devices.
- The providers' own services (Auth0, Cloudflare, Google Cloud, MongoDB Atlas, Resend, Sentry,
  GitHub). Report those to the provider, unless the problem is how Toe Beans configures them.
- Findings from automated scanners with no shown impact, such as missing headers on a static file.

## Supported versions

Only the version live at `toebeans.co.za`, the latest release, gets fixes.
