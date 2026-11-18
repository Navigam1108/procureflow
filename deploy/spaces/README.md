---
title: ProcureFlow
emoji: 🛒
colorFrom: indigo
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
short_description: Supplier comparison, approvals, and sandbox orders
---

# ProcureFlow

A procurement portfolio demo built with Next.js, FastAPI, and LangGraph.
Compare suppliers, review a proposal as Maya, approve it, and create a sandbox purchase order.

[Source code](https://github.com/Navigam1108/procureflow)
| [Open fullscreen](https://navigam-procureflow.hf.space)

## Deployment

Create a public Docker Space using CPU Basic, then upload the project with the
repository-root `Dockerfile`. Copy this file to the Space's root `README.md`.
Hugging Face currently requires a PRO subscription to create a new personal Docker
Space; CPU Basic itself has no hourly hardware charge. Alternatively, with billing
and prepaid credits enabled, explicitly choose CPU Upgrade at $0.03/hour using
`python scripts/deploy_space.py OWNER/procureflow --hardware cpu-upgrade`.
That option configures automatic sleep after five minutes without visitors.
`scripts/deploy_space.py` uploads tracked project files, excluding local credentials,
databases, dependencies, and build output. Install `huggingface_hub` separately to
use the deployment script; it is not an application runtime dependency.

Next.js serves port 7860 and proxies `/api/` to FastAPI on loopback port 8000.
Both processes stop if either fails. The container runs as UID 1000.
`SPACE_HOST` sets the permitted browser origin automatically.

## Demo and model configuration

The published default is offline demo mode, visibly labeled in the app. It uses
deterministic selection and makes no model calls. All suppliers, people, budgets,
and orders are synthetic. Visitors share the same demo workspace.

To enable model-backed planning, add `GROQ_API_KEY` as a Space secret and set the
variable `AGENT_MODE=live`. The default model is `openai/gpt-oss-20b`. Never commit
credentials. A fresh live-mode database starts without sample requests.

HF iframe cookies use `SameSite=None; Secure; HttpOnly`; role checks and
allowed-origin checks stay enforced. The direct `.hf.space` URL is also available.

## Storage and sleep

CPU Basic may sleep when inactive. SQLite state and the generated session key reset
when the container is replaced or rebuilt. This public sandbox does not promise
durable storage. For durability, configure an external PostgreSQL `DATABASE_URL`
secret or supported persistent storage. The default deployment requests CPU Basic;
paid CPU Upgrade requires the explicit `--hardware cpu-upgrade` option. The script
does not request paid persistent storage.
