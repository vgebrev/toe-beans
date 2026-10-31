# Spike S-1.4: Cloud Run → Atlas latency probe

Throwaway spike (backlog S-1.4). A plain Node server with the official `mongodb` driver, deployed as
its own Cloud Run service (`toe-beans-db-probe`, `africa-south1`) so it doesn't disturb the S-1.3
service. It talks to the Atlas free cluster on AWS `af-south-1` (Cape Town) as the throwaway
`toe-beans-spike` user (`readWrite` on `spike` only).

**Torn down 31 Oct 2026** after S-1.4 passed: the service, the `spike` collections, the Atlas user and the
`atlas-spike-password` secret are all deleted. Re-running needs a new user and secret (`deploy.sh` expects
the secret name).

On first start it seeds a year of data for two households (two dogs each, about 19.5k documents)
with the indexes the Today read needs. Then:

- `GET /today`: one Today read as architecture §8.4 prescribes: a parallel batch (dogs, today's
  planned sessions, due care tasks, recent logs), then one `$in` lookup of the exercises, so two
  sequential round trips. `Server-Timing: db;dur=…` carries the database time.
- `GET /probe?n=50`: server-side percentiles for single pings, Today reads and transactions (log a
  session + bump the planned session's version, the `UnitOfWork` case).
- `GET /`: a page that times 30 `/today` calls from the device, for the phone measurements.

Budget: warm Today API ≤ 250 ms p95 (architecture §8.4).

## Run

```sh
pnpm install
# locally (the password goes from Secret Manager into the environment, never onto the screen):
MONGO_HOST=toe-beans.uitdn6o.mongodb.net MONGO_USER=toe-beans-spike \
  MONGO_PASSWORD="$(gcloud secrets versions access latest --secret=atlas-spike-password)" \
  PORT=3400 pnpm start
# on Cloud Run:
./deploy.sh
```
