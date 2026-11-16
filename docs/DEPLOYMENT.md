# Deploy ProcureFlow for free

Research checked on 16 November 2026. This guide is prepared configuration, not evidence that a cloud deployment exists.

## Recommendation

Use **Vercel Hobby for Next.js, Render Free for FastAPI, and Neon Free for PostgreSQL**. This keeps the Python agent runtime and persistent database while avoiding a paid subscription for a small personal portfolio demo.

| Option | Current terms | Fit for this project |
| --- | --- | --- |
| Vercel + Render + Neon | Free tiers within their quotas; Render's API sleeps after 15 minutes idle and needs about one minute to wake | Recommended for the requested zero-cost portfolio demo |
| Railway for frontend/API/Postgres | Hobby has a $5/month minimum including $5 usage; additional resource usage is billed | Easier all-in-one option if a monthly budget becomes acceptable; not a guaranteed $5 total |
| All on Render Free | A free API sleeps; free Render Postgres expires after 30 days; free-instance hours are shared | Use Neon instead of expiring database storage; two separate free web services add cold-start and quota friction |

Official sources: [Vercel Hobby](https://vercel.com/docs/plans/hobby), [Render free-service restrictions](https://render.com/docs/free), [Neon pricing and quotas](https://neon.com/pricing), [Railway pricing](https://railway.com/pricing).

Neon's currently listed free allowance includes 100 CU-hours per month per project and 1 GB storage per project. Check each provider's current limits when creating accounts. Free tiers do not guarantee an always-on demo. Groq usage is a separate provider allowance and is not included in hosting.

## 1. Create the database

1. Create a Neon Free project, preferably near the API's Singapore region when an appropriate free region is available.
2. Copy the provided Postgres connection string, retaining its TLS parameters such as `sslmode=require`.
3. Put it in Render's `DATABASE_URL` environment variable. Never commit it.

The backend accepts `postgres://`, `postgresql://`, or `postgresql+psycopg://` URLs and uses the installed psycopg 3 driver. It creates the MVP tables on first startup. Existing local SQLite data is not copied automatically.

## 2. Deploy the API on Render

1. Connect this repository to Render and create a Blueprint using the root `render.yaml`.
2. Keep the backend on the **Free** instance type.
3. Set `DATABASE_URL` to the Neon connection string.
4. Set `ALLOWED_ORIGINS` to your exact frontend origin, e.g. `https://your-project.vercel.app`. Multiple explicit origins may be comma separated; do not use a wildcard.
5. Render generates a persistent `SESSION_SECRET` in the environment. Keep it stable across redeploys.
6. Keep `SESSION_HTTPS_ONLY=true` for the hosted app.
7. Deploy and record its actual `https://...onrender.com` URL. Verify `/api/health` returns JSON with `status: ok` and `storage: postgresql`.

The Dockerfile respects Render's `PORT`. The Blueprint uses a single API process because this MVP's interrupted-run recovery is designed for one worker. Render supports [Docker build contexts and health checks in Blueprints](https://render.com/docs/blueprint-spec).

The Blueprint defaults to `AGENT_MODE=demo` and `DEMO_AUTH=true`: a synthetic shared portfolio sandbox that works without exposing a live inference budget. To demonstrate live Groq calls, add these **backend-only** environment variables and redeploy:

```dotenv
AGENT_MODE=live
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_MODEL=openai/gpt-oss-20b
LLM_API_KEY=<set-in-provider-dashboard>
```

A freely accessible live-mode demo lets visitors consume your inference quota. For an invitation-only live demo, configure `DEMO_AUTH=false`, distinct requester/approver tokens of at least 24 characters, and the stable session secret; distribute role tokens privately. This uses the MVP's existing two-role token login, not SSO. Do not include a Groq key in Vercel frontend variables or source code.

## 3. Deploy the frontend on Vercel

1. Import the same GitHub repo into Vercel using the **Hobby** plan.
2. Set **Root Directory** to `frontend`.
3. Use the detected Next.js framework, `npm ci`, and `npm run build`. `frontend/vercel.json` records these settings.
4. Add a server/build environment variable: `API_URL=https://your-actual-api.onrender.com` (no trailing slash).
5. Deploy and copy the actual Vercel URL.
6. Update Render's `ALLOWED_ORIGINS` with that exact Vercel origin, then redeploy the API if the value changed.

`API_URL` is read when Next.js builds its `/api/*` rewrite rules. Rebuild the frontend whenever the backend URL changes. Browser requests stay on the frontend's origin; the Next.js server proxies them to FastAPI, including role-session cookies. Do not set the browser API target to a private Railway or Docker hostname.

## 4. Verify the hosted workflow

1. Open the frontend; allow the Render API about one minute to wake from idle. The UI provides a readable retry message if the provider returns an HTML wake-up page.
2. Create a future-dated request; inspect policy eligibility and supplier comparisons.
3. Switch to Maya, select another eligible supplier with a reason, and approve the new exact proposal.
4. Return to Pratham, confirm Maya's shared choice and note, and create the sandbox order.
5. Refresh, redeploy the API, and confirm the order is still present in Neon.
6. Verify repeated order submission returns the existing order and does not reserve stock/budget twice.

The cold-start behavior is a property of the free Render service, not an agent error. Render's free filesystem is ephemeral, so use Neon for records and an environment-based session secret for stable login cookies. Do not rely on `.data/procureflow.db` in a free cloud container.

## GitHub delivery

The repo contains CI for backend tests, the 60 offline evaluation scenarios, and a production frontend build. `.env`, runtime databases, session keys, local provider state, and dependency directories are ignored. The public source includes only synthetic catalog/policy fixtures and sandbox screenshots.

No cloud service, paid subscription, or domain is created merely by committing these files. Account creation and actual deployment still need the selected providers' connections.
