# ProcureFlow

A working procurement agent MVP: describe a purchase, compare compliant suppliers, obtain separate human approval, and create one durable sandbox purchase order.
All company policies, supplier offers, budgets, and orders are synthetic.

**[Live demo on Hugging Face Spaces](https://huggingface.co/spaces/Navigam/procureflow)**
The public sandbox uses offline demo mode and may need a moment to wake from sleep.

For a single-container Hugging Face deployment, see the [Docker Spaces guide](deploy/spaces/README.md).

![Shared supplier comparison](docs/screenshots/maya-shared-comparison.jpg)

For a free hosted portfolio demo, see the [Vercel + Render + Neon deployment guide](docs/DEPLOYMENT.md). The repository includes a free Render backend Blueprint, Vercel frontend configuration, and GitHub Actions checks. These files prepare deployment; they do not mean the app is already hosted.

## Run locally on Windows

Requires Python 3.12+ and Node.js 22+. From this directory:

```powershell
.\scripts\start.ps1 -Install
```

After the first install:

```powershell
.\scripts\start.ps1
```

Open **http://127.0.0.1:3000**. API documentation is at **http://127.0.0.1:8000/docs**.

```powershell
.\scripts\stop.ps1
```

If your PowerShell policy blocks a local script, you can run both services directly in separate terminals:

```powershell
# Terminal 1, project root
.\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

```powershell
# Terminal 2
cd frontend
npm run dev
```

The default SQLite database and persistent session-signing key live in `.data/`. Restarting either service preserves requests, approvals, traces, orders, stock, and budgets.

## Groq configuration

Copy `.env.example` to `.env` if needed. The existing local `.env` is ignored by Git. Keep credentials there, never in frontend code or a commit.

```dotenv
AGENT_MODE=live
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_MODEL=openai/gpt-oss-20b
LLM_API_KEY=your_local_groq_key
DEMO_AUTH=true
```

Restart the backend after changing configuration. `GROQ_API_KEY` is also accepted. The model is configurable; model access depends on your Groq account. See [Groq compatibility](https://console.groq.com/docs/openai) and [tool calling](https://console.groq.com/docs/tool-use/overview).

- **Live mode:** an LLM extracts typed requirements, then uses a bounded tool-calling planner to select an eligible offer. Token usage is recorded in model events. Credentials stay on the backend.
- **Demo mode:** set `AGENT_MODE=demo`. A bounded parser and deterministic lowest-cost selection exercise the same business tools without LLM calls. This mode is labeled in the interface. It is not a model-quality benchmark and cannot interpret arbitrary natural language.

Example request:

> We need 12 developer laptops with 16 GB RAM for the Bengaluru office, under INR 1500000, delivered before 2026-12-15.

Dates in the UI examples are generated relative to today. Use a future deadline when copying older examples. The offline parser recognizes the listed office cities, explicit numeric quantities, INR budgets including lakh/k notation, and ISO or named-month dates. Use the form's **Add exact requirements** fields for other locations or precise inputs.

## Two-minute demo

1. As **Pratham**, choose **New request**, select the Laptops example, and prepare a proposal.
2. Inspect the comparison highlights on **Proposal**, then open **Supplier comparison** for the side-by-side price, delivery, stock, RAM, and eligibility table. The cheapest unapproved supplier is excluded.
3. Choose **Review as Maya**. The comparison opens automatically. Maya can keep the recommendation or explain her reason and choose a different eligible offer with **Use this offer**. Changing the supplier creates a new proposal revision and still requires approval. Approve that exact proposal and optionally add a note.
4. Choose **Continue as Pratham**. The selected supplier, Maya's reason, and her approval note are visible on the proposal; the same comparison remains available. Then **Create purchase order**.
5. Download the order. Inspect **Activity trail**, then refresh the page or restart the backend to demonstrate persistence.

Alternative failure demo: after approval, simulate a selected-supplier outage. Checkout refuses the stale proposal and moves the request to **Needs fresh proposal**. Replan, inspect the alternative vendor, get fresh approval, and finish. Restore a supplier in **Suppliers**. The simulation affects synthetic availability only.

Choose **Missing details** in the new-request form to demonstrate clarification. Add a whole-number quantity, INR ceiling, and future deadline in the clarification box.

## What is implemented

- Next.js / React / TypeScript workspace: overview, searchable requests, approval inbox, orders, supplier catalog, policy library, request form, supplier comparison, and event trail.
- FastAPI and SQLAlchemy backend with SQLite default and PostgreSQL support.
- LangGraph orchestration: typed intake → clarification or business-tool investigation → bounded selection.
- Policy lookup with stable policy IDs and section citations. This small MVP uses an authoritative policy fixture, not a vector database or document ingestion pipeline.
- Server-side eligibility rules for approved suppliers, stock, final INR prices, department budget, request ceiling, laptop RAM, and arrival deadline.
- Separate requester and approver roles. Approval is bound to a proposal revision and a SHA-256 digest of the full quote.
- Shared supplier comparison with lowest-price and fastest-delivery highlights. Maya may select another eligible offer with a mandatory explanation; the server refreshes constraints, rejects unseen quote changes, increments the proposal revision, and keeps final approval separate. The requester sees the choice, rationale, and review note.
- Atomic purchase-order creation, inventory decrement, and budget commitment. A unique request/order constraint and transactional checks prevent duplicate effects and overspending.
- Persisted intake checkpoints and workflow events. Approval waits survive restarts. Interrupted read-only planning runs become resumable; resume replays investigation using saved requirements and fresh tool data. This is application-level recovery, not arbitrary instruction-level LangGraph checkpoint resumption.
- Seven real MCP stdio tools backed by the same HTTP API. Approval is deliberately absent from the agent tool surface.
- Seed catalog, budgets, and (in demo mode on an empty database) three sample requests.

## Architecture

```mermaid
flowchart LR
  UI[Next.js workspace] --> API[FastAPI + signed role session]
  MCP[MCP client] --> Tools[MCP stdio adapter]
  Tools --> API
  API --> Graph[LangGraph intake and planning]
  Graph --> Model[Groq model or offline adapter]
  Graph --> Read[Policy / catalog / budget tools]
  Read --> DB[(SQLite or PostgreSQL)]
  API --> Review[Human review of exact proposal]
  Review --> Write[Transactional order creation]
  Write --> DB
```

The model cannot grant approval or directly write orders. Any agent-issued order tool call is checked again by the backend. The order transaction revalidates approval, supplier version, stock, price, delivery feasibility, and available budget.

## Validation

From the project root:

```powershell
.\.venv\Scripts\python.exe -m pytest backend/tests -q
.\.venv\Scripts\python.exe scripts/evaluate.py
cd frontend
npm run build
```

The committed [offline evaluation report](docs/evaluation-report.json) contains 60 isolated scenarios covering normal selection, 32 GB hardware requirements, inadequate ceilings, urgent deadlines, supplier failover, and missing fields. Successful cases additionally exercise approval and duplicate-order retries. Timings include local database writes; they are not live-model latency or a production load benchmark.

The automated tests additionally cover unauthorized/self approval, stale revisions, quote tampering, rejection, budget changes, malformed requests, restart recovery, concurrent checkout, prompt-like text that attempts to override policy, model errors, and a mocked live tool-calling loop.

With both services running:

```powershell
.\.venv\Scripts\python.exe scripts/check_mcp.py
# Makes actual Groq calls using a synthetic request:
.\.venv\Scripts\python.exe scripts/smoke_live.py
```

Live Groq intake and tool selection were verified locally with `openai/gpt-oss-20b`. The browser approval-to-order flow was also exercised. A separate disposable PostgreSQL 17 cluster passed approval, concurrent duplicate checkout, inventory, and budget smoke checks. The Docker recipes are provided but were not built in this environment because Docker is unavailable.

## PostgreSQL and containers

For a running PostgreSQL database, set `DATABASE_URL` and restart the backend:

```dotenv
DATABASE_URL=postgresql+psycopg://procureflow:procureflow@localhost:5432/procureflow
```

For an optional isolated container deployment:

```powershell
docker compose up --build
```

The compose stack includes PostgreSQL, the API, and the production Next.js server, and binds the web/API ports to localhost. `.env` values go to the backend only. Existing local SQLite data is not automatically migrated to PostgreSQL. With live mode and an empty PostgreSQL database, create the first request yourself; synthetic requests are auto-seeded only in offline demo mode.

## MCP

Run from `backend/`:

```powershell
..\.venv\Scripts\python.exe -m app.mcp_server
```

Configure your MCP client with that executable, `-m app.mcp_server`, and `cwd` pointing to `backend/`. Tools: `search_policy`, `search_catalog`, `check_budget`, `submit_request`, `get_request`, `resume_request`, `create_purchase_order`.

In non-demo auth mode, set `PROCUREFLOW_API_TOKEN` to the requester token in the MCP client's environment. Keep the approver credential out of the agent process.

## Scope and limitations

This is a local portfolio MVP, not an enterprise purchasing service. It supports one line item per request, one synthetic organization, whole-rupee INR amounts, a small catalog, and final fixed prices including tax/shipping. Arrival estimates use calendar days and are recomputed during checkout.

Demo authentication intentionally lets you switch between both synthetic personas. Backend role checks are still enforced, but this switcher is not an identity boundary for a public deployment. Set `DEMO_AUTH=false`, distinct `REQUESTER_API_TOKEN` and `APPROVER_API_TOKEN` values of at least 24 characters, and a `SESSION_SECRET` of at least 32 characters to require role tokens and disable outage controls. This remains a shared two-role local session model; production would require SSO, per-user/tenant authorization, HTTPS cookie configuration, migrations, background workers, provider retries and rate controls, and broader observability.

No real orders are transmitted, no payments are made, and no supplier integrations are represented as real. Model calls are bounded; failures remain visible and resumable instead of silently falling back to deterministic output.

