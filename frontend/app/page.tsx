"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Building2,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileCheck2,
  FileText,
  LayoutDashboard,
  LoaderCircle,
  Package,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Truck,
  Users,
  Wallet,
  X,
  XCircle,
  Zap,
} from "lucide-react";

type Status =
  | "new"
  | "running"
  | "needs_clarification"
  | "awaiting_approval"
  | "approved"
  | "ordered"
  | "blocked"
  | "needs_replan"
  | "failed"
  | "rejected";
type Spec = {
  category?: string;
  quantity?: number;
  budget_limit?: number;
  location?: string;
  deadline?: string;
  min_ram_gb?: number;
};
type Offer = {
  id: string;
  vendor: string;
  product: string;
  category: string;
  unit_price: number;
  stock: number;
  delivery_days: number;
  ram_gb: number;
  approved: boolean;
  active: boolean;
  total: number;
  arrival: string;
  eligible: boolean;
  reasons: string[];
};
type Quote = Offer & {
  quantity: number;
  location: string;
  deadline: string;
  revision: number;
  selected_by?: string;
  selection_reason?: string;
};
type Policy = { id: string; title: string; section: string; text: string };
type Trace = {
  id: number;
  kind: string;
  title: string;
  detail: string;
  created_at: string;
  payload: Record<string, unknown>;
};
type Order = {
  id: string;
  request_id: string;
  vendor: string;
  product: string;
  quantity: number;
  total: number;
  department: string;
  approved_by: string;
  created_at: string;
};
type Purchase = {
  id: string;
  title: string;
  description: string;
  department: string;
  owner: string;
  status: Status;
  spec: Spec;
  quote: Quote | null;
  revision: number;
  questions: string[];
  candidates: Offer[];
  explanation: string;
  created_at: string;
  updated_at: string;
  traces?: Trace[];
  order?: Order | null;
  policies?: Policy[];
  review?: {
    reviewer: string;
    revision: number;
    decision: string;
    note: string;
  } | null;
};
type Workspace = {
  requests: Purchase[];
  orders: Order[];
  budgets: {
    department: string;
    total: number;
    committed: number;
    available: number;
  }[];
  offers: Offer[];
  policies: Policy[];
};
type Session = {
  user: { role: "requester" | "approver"; name: string; email: string } | null;
  demo_auth: boolean;
  agent_mode: string;
};
type View =
  | "Overview"
  | "Requests"
  | "Approvals"
  | "Purchase orders"
  | "Suppliers"
  | "Policy library";

const labels: Record<Status, string> = {
  new: "Ready to plan",
  running: "Investigating",
  needs_clarification: "Needs details",
  awaiting_approval: "Awaiting approval",
  approved: "Approved",
  ordered: "Order placed",
  blocked: "No eligible offer",
  needs_replan: "Needs fresh proposal",
  failed: "Ready to resume",
  rejected: "Rejected",
};
const money = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
const shortMoney = (value: number) =>
  value >= 100000 ? `₹${(value / 100000).toFixed(1)}L` : money(value);
const niceDate = (value?: string) =>
  value
    ? new Date(value).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
      })
    : "Not specified";
const futureDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 21);
  return date.toLocaleDateString("en-CA");
};
const fullDate = (value: string) =>
  new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error(
      "The API may be waking up on free hosting. Wait about a minute, then refresh the workspace.",
    );
  }
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : "Please check the request fields and try again.",
    );
  return data;
}

function Badge({ status }: { status: Status }) {
  return (
    <span className={`badge ${status}`}>
      <i />
      {labels[status]}
    </span>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <Package size={30} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function ComparisonSummary({
  request,
  onCompare,
}: {
  request: Purchase;
  onCompare?: () => void;
}) {
  const eligible = request.candidates.filter((offer) => offer.eligible);
  const cheapest = [...eligible].sort(
    (a, b) => a.total - b.total || a.delivery_days - b.delivery_days,
  )[0];
  const fastest = [...eligible].sort(
    (a, b) => a.delivery_days - b.delivery_days || a.total - b.total,
  )[0];
  if (!request.candidates.length) return null;
  return (
    <section
      className="comparison-summary"
      aria-label="Supplier comparison summary"
    >
      <div className="comparison-summary-heading">
        <strong>{request.candidates.length} offers compared</strong>
        <span>{eligible.length} meet the requirements</span>
      </div>
      <div className="comparison-highlights">
        <div>
          <small>Lowest eligible total</small>
          <strong>
            {cheapest ? money(cheapest.total) : "No eligible offers"}
          </strong>
          <span>
            {cheapest
              ? `${cheapest.vendor} · ${cheapest.delivery_days} days`
              : "Adjust the request to continue"}
          </span>
        </div>
        <div>
          <small>Fastest eligible delivery</small>
          <strong>{fastest ? `${fastest.delivery_days} days` : "—"}</strong>
          <span>
            {fastest
              ? `${fastest.vendor} · ${money(fastest.total)}`
              : "No compliant delivery option"}
          </span>
        </div>
      </div>
      {onCompare && (
        <button className="comparison-open" onClick={onCompare}>
          Compare prices, delivery & policy checks
          <ArrowRight size={15} />
        </button>
      )}
    </section>
  );
}

export default function Home() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [view, setView] = useState<View>("Overview");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [detail, setDetail] = useState<Purchase | null>(null);
  const [detailTab, setDetailTab] = useState("Proposal");
  const [newOpen, setNewOpen] = useState(false);
  const [personaOpen, setPersonaOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [clarification, setClarification] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [selectionReason, setSelectionReason] = useState("");
  const [token, setToken] = useState("");
  const [loginRole, setLoginRole] = useState("requester");
  const [description, setDescription] = useState("");
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("Engineering");
  const [exact, setExact] = useState(false);
  const [form, setForm] = useState({
    category: "laptop",
    quantity: "12",
    budget_limit: "1500000",
    location: "Bengaluru",
    deadline: futureDate(),
    min_ram_gb: "16",
  });
  const dialogRef = useRef<HTMLDivElement>(null);
  const detailBodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    detailBodyRef.current?.scrollTo({ top: 0 });
  }, [detail?.id, detail?.status, detailTab]);

  const refresh = useCallback(async () => {
    const status = await api<Session>("/session");
    setSession(status);
    if (status.user) setWorkspace(await api<Workspace>("/workspace"));
  }, []);
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!newOpen && !detail) return;
    const previous = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        setNewOpen(false);
        setDetail(null);
      }
      if (event.key === "Tab") {
        const items = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input, select, textarea, [tabindex="0"]',
        );
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [newOpen, detail?.id, busy]);

  async function action(label: string, callback: () => Promise<void>) {
    setBusy(label);
    setError("");
    try {
      await callback();
    } catch (e) {
      setError((e as Error).message);
      if (detail)
        setDetail(
          await api<Purchase>(`/requests/${detail.id}`).catch(() => detail),
        );
    } finally {
      setBusy("");
    }
  }
  async function openDetail(request: Purchase) {
    setError("");
    setDetailTab(
      session?.user?.role === "approver" &&
        request.status === "awaiting_approval"
        ? "Supplier comparison"
        : "Proposal",
    );
    setReviewNote("");
    setSelectionReason("");
    setClarification("");
    await action("Opening request", async () =>
      setDetail(await api<Purchase>(`/requests/${request.id}`)),
    );
  }
  async function switchPersona(role: "requester" | "approver") {
    await action("Switching persona", async () => {
      setSession(await api<Session>("/session", { persona: role, token }));
      setPersonaOpen(false);
      setToken("");
      await refresh();
      if (detail)
        setDetailTab(
          role === "approver" && detail.status === "awaiting_approval"
            ? "Supplier comparison"
            : "Proposal",
        );
      setToast(
        `Now viewing as ${role === "requester" ? "Pratham · requester" : "Maya · procurement approver"}`,
      );
    });
  }
  async function mutateRequest(path: string, body: unknown, message: string) {
    if (!detail) return;
    await action(message, async () => {
      await api(`/requests/${detail.id}/${path}`, body);
      setDetail(await api<Purchase>(`/requests/${detail.id}`));
      await refresh();
      setToast(message);
    });
  }
  function newRequest() {
    setError("");
    setTitle("");
    setDescription("");
    setExact(false);
    setNewOpen(true);
  }
  async function submit() {
    await action("Comparing suppliers and checking policy", async () => {
      const body = {
        title: title.trim() || description.trim().slice(0, 90),
        description: description.trim(),
        department,
        ...(exact
          ? {
              spec: {
                ...form,
                quantity: Number(form.quantity),
                budget_limit: Number(form.budget_limit),
                min_ram_gb: Number(form.min_ram_gb),
                unsupported: false,
              },
            }
          : {}),
      };
      const created = await api<Purchase>("/requests", body);
      setNewOpen(false);
      setDetail(created);
      setDetailTab("Proposal");
      await refresh();
      setToast(
        created.status === "awaiting_approval"
          ? "Proposal ready for human review"
          : "Request saved",
      );
    });
  }

  const requests = workspace?.requests || [];
  const policies = workspace?.policies || [];
  const pending = requests.filter((r) => r.status === "awaiting_approval");
  const attention = requests.filter((r) =>
    ["needs_clarification", "blocked", "needs_replan", "failed"].includes(
      r.status,
    ),
  );
  const committed =
    workspace?.budgets.reduce((sum, b) => sum + b.committed, 0) || 0;
  const totalBudget =
    workspace?.budgets.reduce((sum, b) => sum + b.total, 0) || 1;
  const visible = requests.filter(
    (r) =>
      (view !== "Approvals" || r.status === "awaiting_approval") &&
      (filter === "all" ||
        (filter === "attention"
          ? attention.some((a) => a.id === r.id)
          : r.status === filter)) &&
      `${r.title} ${r.id} ${r.department}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const isApprover = session?.user?.role === "approver";
  const steps = [
    "Request received",
    "Policy & supplier checks",
    "Human approval",
    "Purchase order",
  ];
  const stepIndex = detail
    ? detail.status === "ordered"
      ? 4
      : detail.status === "approved"
        ? 3
        : detail.status === "awaiting_approval"
          ? 2
          : 1
    : 0;

  if (session && !session.user)
    return (
      <main className="login-page">
        <div className="login-card">
          <div className="brand">
            <span className="brand-icon">
              <ShoppingBag size={23} />
            </span>
            procureflow<span className="brand-dot">.</span>
          </div>
          <h1>Welcome to your workspace</h1>
          <p>Use your locally configured role token to sign in.</p>
          <label>
            Role
            <select
              value={loginRole}
              onChange={(e) => setLoginRole(e.target.value)}
            >
              <option value="requester">Requester</option>
              <option value="approver">Procurement approver</option>
            </select>
          </label>
          <label>
            Sign-in token
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
          <button
            className="primary"
            onClick={() => switchPersona(loginRole as "requester" | "approver")}
            disabled={!!busy}
          >
            Sign in <ArrowRight size={16} />
          </button>
        </div>
      </main>
    );

  return (
    <div className="shell">
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => setView("Overview")}
          aria-label="ProcureFlow home"
        >
          <span className="brand-icon">
            <ShoppingBag size={22} strokeWidth={2.3} />
          </span>
          procureflow<span className="brand-dot">.</span>
        </button>
        <div className="workspace-switch">
          <span className="workspace-icon">
            <Building2 size={18} />
          </span>
          <div>
            <strong>Acme workspace</strong>
            <small>Corporate services</small>
          </div>
          <span className="workspace-pill">DEMO</span>
        </div>
        <span className="nav-caption">WORKSPACE</span>
        <nav>
          {(
            [
              { name: "Overview", icon: LayoutDashboard },
              { name: "Requests", icon: FileText },
              { name: "Approvals", icon: FileCheck2 },
              { name: "Purchase orders", icon: Package },
            ] as const
          ).map((item) => (
            <button
              key={item.name}
              aria-label={item.name}
              className={`nav-item ${view === item.name ? "active" : ""}`}
              onClick={() => {
                setView(item.name);
                setFilter("all");
              }}
            >
              <item.icon size={19} />
              <span>{item.name}</span>
              {item.name === "Approvals" && pending.length > 0 && (
                <b>{pending.length}</b>
              )}
            </button>
          ))}
        </nav>
        <span className="nav-caption">RESOURCES</span>
        <nav>
          {(
            [
              { name: "Suppliers", icon: Users },
              { name: "Policy library", icon: ShieldCheck },
            ] as const
          ).map((item) => (
            <button
              key={item.name}
              aria-label={item.name}
              className={`nav-item ${view === item.name ? "active" : ""}`}
              onClick={() => setView(item.name)}
            >
              <item.icon size={19} />
              <span>{item.name}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="agent-mini">
            <span className="agent-spark">
              <Sparkles size={17} />
            </span>
            <div>
              <strong>Procurement agent</strong>
              <small>
                <i />
                {session?.agent_mode === "live"
                  ? "Live model connected"
                  : "Offline demo mode"}
              </small>
            </div>
          </div>
          <div className="sidebar-note">
            <ShieldCheck size={15} />
            Every order starts with approval.
          </div>
          <div className="persona-wrap">
            <button
              className="persona"
              aria-label="Switch workspace persona"
              onClick={() => setPersonaOpen(!personaOpen)}
              aria-expanded={personaOpen}
            >
              <span className={`avatar ${isApprover ? "maya" : ""}`}>
                {isApprover ? "MS" : "PP"}
              </span>
              <span>
                <strong>{session?.user?.name || "Loading workspace"}</strong>
                <small>
                  {isApprover
                    ? "Procurement approver"
                    : "Employee · Engineering"}
                </small>
              </span>
              <ChevronDown size={16} />
            </button>
            {personaOpen && (
              <div className="persona-menu">
                <p>
                  {session?.demo_auth ? "SWITCH DEMO PERSONA" : "SWITCH ROLE"}
                </p>
                {!session?.demo_auth && (
                  <input
                    type="password"
                    aria-label="Role token"
                    placeholder="Role token"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                  />
                )}
                <button
                  onClick={() => switchPersona("requester")}
                  disabled={!!busy}
                >
                  <span className="avatar">PP</span>
                  <span>
                    Pratham Prajapati
                    <small>Submit requests & create orders</small>
                  </span>
                </button>
                <button
                  onClick={() => switchPersona("approver")}
                  disabled={!!busy}
                >
                  <span className="avatar maya">MS</span>
                  <span>
                    Maya Shah<small>Review & approve proposals</small>
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <strong>{view}</strong>
          </div>
          <div className="top-actions">
            <span className="environment">
              <i />
              Sandbox workspace
            </span>
            <button
              className="icon-button"
              title="Refresh workspace"
              aria-label="Refresh workspace"
              disabled={!!busy}
              onClick={() => action("Refreshing", refresh)}
            >
              <RefreshCw
                size={17}
                className={busy === "Refreshing" ? "spin" : ""}
              />
            </button>
            <button
              className="help-button"
              onClick={() => {
                setView("Policy library");
                setToast(
                  "Demo personas let you try both sides of the approval workflow.",
                );
              }}
              aria-label="Workspace help"
            >
              <CircleHelp size={19} />
            </button>
          </div>
        </header>
        <main className="main-content">
          {error && !newOpen && !detail && (
            <div className="error-banner" role="alert">
              <XCircle size={18} />
              <span>{error}</span>
              <button
                onClick={() => {
                  setError("");
                  refresh().catch((e) => setError(e.message));
                }}
              >
                Retry
              </button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span />
                YOUR PROCUREMENT WORKSPACE
              </div>
              <h1>
                {view === "Overview"
                  ? "Good things start with a request."
                  : view}
              </h1>
              <p>
                {view === "Overview"
                  ? "From a team need to an approved order. Keep everything moving, together."
                  : view === "Approvals"
                    ? "Review the details. Make the call. Every decision leaves a clear trail."
                    : view === "Suppliers"
                      ? "A small, transparent catalog of synthetic suppliers for this demo."
                      : view === "Policy library"
                        ? "The rules behind every recommendation, with a source you can inspect."
                        : view === "Purchase orders"
                          ? "Approved purchases, with one reliable record for every request."
                          : "Every purchase request, from first idea to final order."}
              </p>
            </div>
            {!isApprover && (
              <button className="primary" onClick={newRequest}>
                <Plus size={18} />
                New request
              </button>
            )}
          </div>

          {!workspace ? (
            <div className="loading-workspace">
              <LoaderCircle className="spin" size={28} />
              <p>
                {error
                  ? "The backend is not available. Use Retry above after starting it."
                  : "Opening your procurement workspace…"}
              </p>
            </div>
          ) : (
            <>
              {view === "Overview" && (
                <>
                  <section
                    className="stats-grid"
                    aria-label="Workspace metrics"
                  >
                    {[
                      {
                        label: "Total requests",
                        value: requests.length,
                        foot: "Across your workspace",
                        icon: FileText,
                        className: "teal",
                      },
                      {
                        label: "Awaiting approval",
                        value: pending.length,
                        foot: pending.length
                          ? "Ready for a human review"
                          : "Your inbox is up to date",
                        icon: Clock3,
                        className: "amber",
                      },
                      {
                        label: "Purchase orders",
                        value: workspace.orders.length,
                        foot: "Approved & committed",
                        icon: Package,
                        className: "blue",
                      },
                      {
                        label: "Committed spend",
                        value: shortMoney(committed),
                        foot: `${Math.round((committed / totalBudget) * 100)}% of workspace budget`,
                        icon: Wallet,
                        className: "purple",
                      },
                    ].map((stat) => (
                      <div className="stat-card" key={stat.label}>
                        <div className="stat-label">
                          {stat.label}
                          <span className={`stat-icon ${stat.className}`}>
                            <stat.icon size={18} />
                          </span>
                        </div>
                        <strong>{stat.value}</strong>
                        <small>{stat.foot}</small>
                      </div>
                    ))}
                  </section>
                  <section className="overview-middle">
                    <div className="agent-card">
                      <div className="agent-card-heading">
                        <span className="spark-box">
                          <Sparkles size={23} />
                        </span>
                        <span className="tiny-pill">
                          YOUR PURCHASING PARTNER
                        </span>
                      </div>
                      <h2>
                        You describe the need.
                        <br />
                        We connect the dots.
                      </h2>
                      <p>
                        Your agent checks policy, compares suppliers, and
                        prepares a proposal. You stay in control of the
                        decision.
                      </p>
                      <div className="agent-card-footer">
                        <span>
                          <ShieldCheck size={15} />
                          Human approval, always
                        </span>
                        <button
                          onClick={
                            isApprover
                              ? () => {
                                  setView("Approvals");
                                  setFilter("all");
                                }
                              : newRequest
                          }
                        >
                          {isApprover ? "Review proposals" : "Make a request"}
                          <ArrowUpRight size={17} />
                        </button>
                      </div>
                      <div className="agent-art" aria-hidden="true">
                        <div className="orbit orbit-one" />
                        <div className="orbit orbit-two" />
                        <div className="art-node node-one">
                          <FileText size={20} />
                        </div>
                        <div className="art-node node-two">
                          <ShieldCheck size={20} />
                        </div>
                        <div className="art-node node-three">
                          <Package size={20} />
                        </div>
                        <div className="art-center">
                          <Sparkles size={34} />
                        </div>
                      </div>
                    </div>
                    <div className="budget-card">
                      <div className="section-title">
                        <h2>Department budgets</h2>
                        <span className="subtle">INR</span>
                      </div>
                      <p className="muted-small">
                        Committed against allocated budget
                      </p>
                      <div className="budget-list">
                        {workspace.budgets.map((budget, i) => (
                          <div className="budget-row" key={budget.department}>
                            <div>
                              <span>
                                <i className={`budget-dot dot-${i}`} />
                                {budget.department}
                              </span>
                              <strong>
                                {shortMoney(budget.committed)}{" "}
                                <em>/ {shortMoney(budget.total)}</em>
                              </strong>
                            </div>
                            <div className="budget-track">
                              <span
                                className={`fill-${i}`}
                                style={{
                                  width: `${Math.min(100, (budget.committed / budget.total) * 100)}%`,
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="budget-footer">
                        <span>
                          <Wallet size={14} />
                          Available to spend
                        </span>
                        <strong>{shortMoney(totalBudget - committed)}</strong>
                      </div>
                    </div>
                  </section>
                </>
              )}

              {["Overview", "Requests", "Approvals"].includes(view) && (
                <section className="requests-section">
                  <div className="section-title">
                    <div className="title-with-count">
                      <h2>
                        {view === "Overview"
                          ? "Recent requests"
                          : view === "Approvals"
                            ? "Your review queue"
                            : "All requests"}
                      </h2>
                      <span>
                        {view === "Approvals"
                          ? pending.length
                          : requests.length}
                      </span>
                    </div>
                    {view === "Overview" && (
                      <button
                        className="text-button"
                        onClick={() => setView("Requests")}
                      >
                        View all requests
                        <ArrowRight size={15} />
                      </button>
                    )}
                  </div>
                  <div className="table-toolbar">
                    <div className="filter-tabs">
                      {(view === "Approvals"
                        ? [
                            {
                              label: "Awaiting review",
                              value: "all",
                              count: pending.length,
                            },
                          ]
                        : [
                            {
                              label: "All requests",
                              value: "all",
                              count: requests.length,
                            },
                            {
                              label: "Needs attention",
                              value: "attention",
                              count: attention.length,
                            },
                            {
                              label: "Completed",
                              value: "ordered",
                              count: workspace.orders.length,
                            },
                          ]
                      ).map((tab) => (
                        <button
                          className={filter === tab.value ? "selected" : ""}
                          key={tab.value}
                          onClick={() => setFilter(tab.value)}
                        >
                          {tab.label}
                          <span>{tab.count}</span>
                        </button>
                      ))}
                    </div>
                    <label className="search-input">
                      <Search size={16} />
                      <input
                        placeholder="Search requests…"
                        aria-label="Search requests"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>REQUEST</th>
                          <th>DEPARTMENT</th>
                          <th>STATUS</th>
                          <th>AMOUNT</th>
                          <th>CREATED</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {visible
                          .slice(0, view === "Overview" ? 6 : undefined)
                          .map((request) => (
                            <tr
                              key={request.id}
                              onClick={() => openDetail(request)}
                            >
                              <td>
                                <button
                                  className="request-name"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openDetail(request);
                                  }}
                                >
                                  <span
                                    className={`item-icon ${request.spec.category || "chair"}`}
                                  >
                                    {request.spec.category === "chair" ? (
                                      <ShoppingBag size={18} />
                                    ) : request.spec.category === "monitor" ? (
                                      <LayoutDashboard size={18} />
                                    ) : (
                                      <Package size={18} />
                                    )}
                                  </span>
                                  <span>
                                    <strong>{request.title}</strong>
                                    <small>{request.id}</small>
                                  </span>
                                </button>
                              </td>
                              <td>
                                <span className="department-tag">
                                  {request.department}
                                </span>
                              </td>
                              <td>
                                <Badge status={request.status} />
                              </td>
                              <td className="amount">
                                {request.quote ? (
                                  money(request.quote.total)
                                ) : request.spec.budget_limit ? (
                                  <span className="muted">
                                    ≤ {money(request.spec.budget_limit)}
                                  </span>
                                ) : (
                                  <span className="muted">—</span>
                                )}
                              </td>
                              <td className="date-cell">
                                {niceDate(request.created_at)}
                              </td>
                              <td>
                                <ChevronRight size={16} />
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  {visible.length === 0 && (
                    <Empty
                      title={
                        view === "Approvals"
                          ? "All caught up"
                          : "No requests here yet"
                      }
                      text={
                        view === "Approvals"
                          ? "New proposals will appear here when they are ready for your review."
                          : "Try another search, or start with a new purchase request."
                      }
                    />
                  )}
                  <div className="table-footer">
                    <span>
                      <ShieldCheck size={14} />
                      Policy checks happen before every proposal.
                    </span>
                    <span>Final prices include tax & shipping</span>
                  </div>
                </section>
              )}

              {view === "Purchase orders" && (
                <section className="requests-section">
                  <div className="section-title">
                    <h2>Order register</h2>
                    <span className="subtle">
                      {workspace.orders.length} orders
                    </span>
                  </div>
                  {!workspace.orders.length ? (
                    <Empty
                      title="Your first order starts here"
                      text="Submit a request, have Maya approve the proposal, then create its purchase order as Pratham."
                    />
                  ) : (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>ORDER</th>
                            <th>SUPPLIER</th>
                            <th>DEPARTMENT</th>
                            <th>TOTAL</th>
                            <th>CREATED</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {workspace.orders.map((order) => (
                            <tr key={order.id}>
                              <td>
                                <button
                                  className="request-name"
                                  onClick={() => {
                                    const request = requests.find(
                                      (r) => r.id === order.request_id,
                                    );
                                    if (request) openDetail(request);
                                  }}
                                >
                                  <span className="item-icon laptop">
                                    <Package size={18} />
                                  </span>
                                  <span>
                                    <strong>{order.id}</strong>
                                    <small>
                                      {order.quantity} × {order.product}
                                    </small>
                                  </span>
                                </button>
                              </td>
                              <td>{order.vendor}</td>
                              <td>{order.department}</td>
                              <td className="amount">{money(order.total)}</td>
                              <td>{niceDate(order.created_at)}</td>
                              <td>
                                <a
                                  className="icon-button"
                                  href={`/api/orders/${order.id}/download`}
                                  aria-label={`Download ${order.id}`}
                                >
                                  <ArrowDownToLine size={17} />
                                </a>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}

              {view === "Suppliers" && (
                <section className="supplier-grid">
                  {workspace.offers.map((offer) => (
                    <article className="supplier-card" key={offer.id}>
                      <div className="supplier-top">
                        <span className="supplier-avatar">
                          {offer.vendor
                            .split(" ")
                            .map((s) => s[0])
                            .slice(0, 2)
                            .join("")}
                        </span>
                        <span
                          className={`supplier-status ${offer.active && offer.approved ? "good" : ""}`}
                        >
                          {!offer.approved
                            ? "Unapproved"
                            : offer.active
                              ? "Available"
                              : "Unavailable"}
                        </span>
                      </div>
                      <h2>{offer.vendor}</h2>
                      <p>{offer.product}</p>
                      <strong>
                        {money(offer.unit_price)}
                        <small> / unit</small>
                      </strong>
                      <div className="supplier-meta">
                        <span>
                          <Package size={14} />
                          {offer.stock} in stock
                        </span>
                        <span>
                          <Truck size={14} />
                          {offer.delivery_days} days
                        </span>
                      </div>
                      {session?.demo_auth && offer.approved && (
                        <button
                          className="secondary full-width"
                          disabled={!!busy}
                          onClick={() =>
                            action("Updating supplier", async () => {
                              await api(`/demo/offers/${offer.id}`, {
                                available: !offer.active,
                              });
                              await refresh();
                              setToast(
                                offer.active
                                  ? "Supplier outage simulated"
                                  : "Supplier restored",
                              );
                            })
                          }
                        >
                          {offer.active
                            ? "Simulate outage"
                            : "Restore availability"}
                        </button>
                      )}
                    </article>
                  ))}
                </section>
              )}

              {view === "Policy library" && (
                <>
                  <div className="policy-intro">
                    <span className="spark-box">
                      <ShieldCheck size={23} />
                    </span>
                    <div>
                      <strong>A clear source for every decision</strong>
                      <p>
                        These synthetic policies are applied by the backend.
                        Model output cannot bypass approval, budget, or supplier
                        checks.
                      </p>
                    </div>
                  </div>
                  <section className="policy-grid">
                    {workspace.policies.map((policy) => (
                      <article className="policy-card" key={policy.id}>
                        <span className="policy-id">
                          {policy.id} <span>§ {policy.section}</span>
                        </span>
                        <h2>{policy.title}</h2>
                        <p>{policy.text}</p>
                        <span className="policy-bottom">
                          <CheckCircle2 size={14} />
                          Enforced by purchasing tools
                        </span>
                      </article>
                    ))}
                  </section>
                </>
              )}
              <footer className="page-footer">
                <span>
                  <span className="footer-mark">p.</span>Thoughtful purchasing.
                  A clear trail.
                </span>
                <small>
                  Synthetic demo data · No real purchases or payments
                </small>
              </footer>
            </>
          )}
        </main>
      </div>

      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {busy && !newOpen && !detail && (
        <div className="busy-pill" role="status">
          <LoaderCircle className="spin" size={17} />
          {busy}…
        </div>
      )}

      {newOpen && (
        <div
          className="modal-backdrop"
          onClick={() => !busy && setNewOpen(false)}
        >
          <div
            className="new-dialog"
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dialog-heading">
              <span className="spark-box">
                <Sparkles size={22} />
              </span>
              <button
                className="icon-button"
                aria-label="Close new request"
                onClick={() => setNewOpen(false)}
                disabled={!!busy}
              >
                <X size={21} />
              </button>
            </div>
            <div className="dialog-intro">
              <span className="eyebrow">LET’S GET IT MOVING</span>
              <h2 id="new-title">What does your team need?</h2>
              <p>
                Describe the purchase. Your agent will check the details and
                prepare a proposal for approval.
              </p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <div className="dialog-fields">
                <label>
                  Request title <span className="optional">optional</span>
                  <input
                    placeholder="e.g. Developer laptops for new joiners"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={160}
                  />
                </label>
                <label>
                  Purchase request
                  <textarea
                    autoFocus
                    placeholder="We need 12 developer laptops with 16 GB RAM for Bengaluru, under ₹15 lakh, delivered before…"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    minLength={10}
                    maxLength={5000}
                    required
                    rows={4}
                  />
                </label>
                <div className="example-chips">
                  <span>Try an example</span>
                  {["Laptops", "Monitors", "Missing details"].map((example) => (
                    <button
                      type="button"
                      key={example}
                      onClick={() => {
                        setExact(false);
                        setTitle(
                          example === "Laptops"
                            ? "Laptops for the new engineering cohort"
                            : example === "Monitors"
                              ? "Monitors for the design studio"
                              : "Office seating request",
                        );
                        setDescription(
                          example === "Laptops"
                            ? `We need 12 developer laptops with 16 GB RAM for the Bengaluru office, under INR 1500000, delivered before ${futureDate()}.`
                            : example === "Monitors"
                              ? `We need 8 monitors for the Mumbai office under INR 250000, delivered before ${futureDate()}.`
                              : "We need office chairs for the Pune office.",
                        );
                        setDepartment(
                          example === "Monitors"
                            ? "Design"
                            : example === "Missing details"
                              ? "Operations"
                              : "Engineering",
                        );
                      }}
                    >
                      {example}
                      <ArrowUpRight size={12} />
                    </button>
                  ))}
                </div>
                <label>
                  Department
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                  >
                    {["Engineering", "Design", "Operations"].map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="exact-toggle"
                  onClick={() => setExact(!exact)}
                  aria-expanded={exact}
                >
                  <SlidersHorizontal size={15} />
                  {exact ? "Hide" : "Add"} exact requirements
                  <ChevronDown size={15} />
                </button>
                {exact && (
                  <div className="exact-grid">
                    <label>
                      Item
                      <select
                        value={form.category}
                        onChange={(e) =>
                          setForm({ ...form, category: e.target.value })
                        }
                      >
                        <option value="laptop">Laptops</option>
                        <option value="monitor">Monitors</option>
                        <option value="chair">Office chairs</option>
                      </select>
                    </label>
                    <label>
                      Quantity
                      <input
                        type="number"
                        min="1"
                        max="1000"
                        required
                        value={form.quantity}
                        onChange={(e) =>
                          setForm({ ...form, quantity: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Total ceiling (INR)
                      <input
                        type="number"
                        min="1"
                        max="100000000"
                        required
                        value={form.budget_limit}
                        onChange={(e) =>
                          setForm({ ...form, budget_limit: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Delivery deadline
                      <input
                        type="date"
                        required
                        value={form.deadline}
                        onChange={(e) =>
                          setForm({ ...form, deadline: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Office location
                      <input
                        required
                        value={form.location}
                        onChange={(e) =>
                          setForm({ ...form, location: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Minimum RAM (GB)
                      <input
                        type="number"
                        min="0"
                        max="256"
                        required
                        value={form.min_ram_gb}
                        onChange={(e) =>
                          setForm({ ...form, min_ram_gb: e.target.value })
                        }
                      />
                    </label>
                  </div>
                )}
                {error && (
                  <div className="inline-error" role="alert">
                    <XCircle size={16} />
                    {error}
                  </div>
                )}
              </div>
              <div className="dialog-footer">
                <span>
                  <ShieldCheck size={15} />
                  Nothing is purchased without approval.
                </span>
                <button
                  className="primary"
                  disabled={!!busy || description.trim().length < 10}
                  type="submit"
                >
                  {busy ? (
                    <LoaderCircle className="spin" size={17} />
                  ) : (
                    <Sparkles size={17} />
                  )}
                  {busy ? "Preparing proposal…" : "Prepare proposal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {detail && !newOpen && (
        <div
          className="modal-backdrop detail-backdrop"
          onClick={() => !busy && setDetail(null)}
        >
          <div
            className="detail-dialog"
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="detail-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="detail-header">
              <div>
                <span className="detail-id">
                  {detail.id} <span>· {detail.department}</span>
                </span>
                <h2 id="detail-title">{detail.title}</h2>
                <Badge status={detail.status} />
              </div>
              <button
                className="icon-button"
                aria-label="Close request"
                disabled={!!busy}
                onClick={() => setDetail(null)}
              >
                <X size={22} />
              </button>
            </header>
            <div className="workflow-steps">
              {steps.map((step, i) => (
                <div
                  className={
                    i < stepIndex ? "done" : i === stepIndex ? "current" : ""
                  }
                  key={step}
                >
                  <span>{i < stepIndex ? <Check size={13} /> : i + 1}</span>
                  <small>{step}</small>
                  {i < 3 && <i />}
                </div>
              ))}
            </div>
            <div className="detail-tabs">
              {["Proposal", "Supplier comparison", "Activity trail"].map(
                (tab) => (
                  <button
                    className={detailTab === tab ? "selected" : ""}
                    onClick={() => setDetailTab(tab)}
                    key={tab}
                  >
                    {tab}
                    {tab === "Activity trail" && (
                      <span>{detail.traces?.length || 0}</span>
                    )}
                  </button>
                ),
              )}
              <div className="detail-persona">
                <span className={`avatar ${isApprover ? "maya" : ""}`}>
                  {isApprover ? "MS" : "PP"}
                </span>
                <span>{isApprover ? "Approver" : "Requester"}</span>
                {session?.demo_auth && (
                  <button
                    disabled={!!busy}
                    onClick={() =>
                      switchPersona(isApprover ? "requester" : "approver")
                    }
                  >
                    Switch role
                  </button>
                )}
              </div>
            </div>
            <div className="detail-body" ref={detailBodyRef}>
              {error && (
                <div className="inline-error" role="alert">
                  <XCircle size={17} />
                  {error}
                </div>
              )}
              {detailTab === "Proposal" && (
                <div className="proposal-grid">
                  <div className="proposal-main">
                    <div
                      className={`agent-message ${detail.status === "ordered" ? "success-message" : ""}`}
                    >
                      <span className="agent-message-icon">
                        {detail.status === "ordered" ? (
                          <CheckCheck size={20} />
                        ) : (
                          <Sparkles size={20} />
                        )}
                      </span>
                      <div>
                        <strong>
                          {detail.status === "ordered"
                            ? "Purchase order created"
                            : detail.status === "needs_clarification"
                              ? "Let’s fill in a few details"
                              : detail.status === "blocked"
                                ? "We need to adjust this request"
                                : detail.status === "needs_replan"
                                  ? "This proposal needs a fresh look"
                                  : detail.status === "failed"
                                    ? "Your progress is saved"
                                    : detail.quote?.selected_by
                                      ? "Maya’s supplier choice"
                                      : "Your agent’s recommendation"}
                        </strong>
                        <p>
                          {detail.status === "ordered"
                            ? `Order ${detail.order?.id} is saved. Inventory and department budget have been updated. Retrying this request will return the same order.`
                            : (["awaiting_approval", "approved"].includes(
                                detail.status,
                              ) &&
                                detail.quote?.selection_reason) ||
                              detail.explanation}
                        </p>
                      </div>
                    </div>
                    <ComparisonSummary
                      request={detail}
                      onCompare={() => setDetailTab("Supplier comparison")}
                    />
                    {detail.quote?.selected_by && (
                      <div className="shared-review">
                        <span className="avatar maya">MS</span>
                        <div>
                          <strong>Maya’s comparison is shared with you</strong>
                          <p>{detail.quote.selection_reason}</p>
                          <small>
                            {detail.status === "awaiting_approval"
                              ? "Supplier selected · final approval pending"
                              : `Proposal v${detail.revision} · ${detail.status === "ordered" || detail.status === "approved" ? "approved selection" : "review recorded"}`}
                          </small>
                        </div>
                      </div>
                    )}
                    {detail.review?.note && (
                      <div className="shared-review">
                        <FileCheck2 size={19} />
                        <div>
                          <strong>
                            Maya’s{" "}
                            {detail.review.decision === "approve"
                              ? "approval"
                              : "review"}{" "}
                            note
                          </strong>
                          <p>{detail.review.note}</p>
                        </div>
                      </div>
                    )}
                    {detail.quote && (
                      <div className="quote-card">
                        <div className="quote-vendor">
                          <span className="supplier-avatar">
                            {detail.quote.vendor
                              .split(" ")
                              .map((s) => s[0])
                              .slice(0, 2)
                              .join("")}
                          </span>
                          <div>
                            <h3>{detail.quote.vendor}</h3>
                            <span>
                              <ShieldCheck size={13} />
                              Approved supplier · POL-001 §2.1
                            </span>
                          </div>
                          <span className="proposal-version">
                            v{detail.revision}
                          </span>
                        </div>
                        <div className="quote-product">
                          <span className="item-icon laptop">
                            <Package size={24} />
                          </span>
                          <div>
                            <strong>{detail.quote.product}</strong>
                            <small>
                              {detail.quote.quantity} units ·{" "}
                              {detail.quote.location}
                            </small>
                          </div>
                        </div>
                        <dl className="quote-lines">
                          <div>
                            <dt>Price per unit</dt>
                            <dd>{money(detail.quote.unit_price)}</dd>
                          </div>
                          <div>
                            <dt>Quantity</dt>
                            <dd>{detail.quote.quantity}</dd>
                          </div>
                          <div>
                            <dt>Estimated arrival</dt>
                            <dd>
                              {niceDate(detail.quote.arrival)}{" "}
                              <span className="within-policy">
                                Within deadline
                              </span>
                            </dd>
                          </div>
                          <div className="quote-total">
                            <dt>
                              Total amount<small>Includes tax & shipping</small>
                            </dt>
                            <dd>{money(detail.quote.total)}</dd>
                          </div>
                        </dl>
                      </div>
                    )}
                    {(detail.questions.length > 0 ||
                      ["blocked", "needs_replan"].includes(detail.status)) && (
                      <div className="clarification-card">
                        <h3>
                          {detail.questions.length
                            ? "A little more context"
                            : "Adjust the requirements"}
                        </h3>
                        <ul>
                          {detail.questions.map((q) => (
                            <li key={q}>{q}</li>
                          ))}
                        </ul>
                        {!isApprover ? (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              mutateRequest(
                                "clarify",
                                { message: clarification },
                                "Requirements updated",
                              );
                            }}
                          >
                            <label>
                              Your clarification
                              <textarea
                                value={clarification}
                                onChange={(e) =>
                                  setClarification(e.target.value)
                                }
                                placeholder={`For example: 10 office chairs, budget INR 150000, delivered to Pune before ${futureDate()}.`}
                                rows={3}
                                minLength={3}
                                required
                              />
                            </label>
                            <button className="primary" disabled={!!busy}>
                              <Send size={15} />
                              Update requirements
                            </button>
                          </form>
                        ) : (
                          <p className="muted-small">
                            The requester can supply these details.
                          </p>
                        )}
                      </div>
                    )}
                    {isApprover && detail.status === "awaiting_approval" && (
                      <label className="review-note">
                        Review note <span className="optional">optional</span>
                        <textarea
                          value={reviewNote}
                          onChange={(e) => setReviewNote(e.target.value)}
                          rows={2}
                          placeholder="Add context to your approval or rejection…"
                          maxLength={1000}
                        />
                      </label>
                    )}
                    {detail.order && (
                      <a
                        className="order-download"
                        href={`/api/orders/${detail.order.id}/download`}
                      >
                        <FileText size={22} />
                        <span>
                          <strong>{detail.order.id}</strong>
                          <small>Download sandbox purchase order</small>
                        </span>
                        <ArrowDownToLine size={19} />
                      </a>
                    )}
                    {session?.demo_auth &&
                      detail.quote &&
                      ["awaiting_approval", "approved"].includes(
                        detail.status,
                      ) && (
                        <button
                          className="simulation-button"
                          disabled={!!busy}
                          onClick={() =>
                            action("Simulating supplier outage", async () => {
                              await api(`/demo/offers/${detail.quote!.id}`, {
                                available: false,
                              });
                              await refresh();
                              setToast(
                                "Supplier marked unavailable. Order creation will require a fresh proposal.",
                              );
                            })
                          }
                        >
                          <Zap size={14} />
                          Demo: simulate selected supplier outage
                        </button>
                      )}
                  </div>
                  <aside className="proposal-aside">
                    <div className="requirements-card">
                      <h3>Request details</h3>
                      <dl>
                        <div>
                          <dt>Requested by</dt>
                          <dd>Pratham Prajapati</dd>
                        </div>
                        <div>
                          <dt>Department</dt>
                          <dd>{detail.department}</dd>
                        </div>
                        <div>
                          <dt>Budget ceiling</dt>
                          <dd>
                            {detail.spec.budget_limit
                              ? money(detail.spec.budget_limit)
                              : "Needs clarification"}
                          </dd>
                        </div>
                        <div>
                          <dt>Delivery deadline</dt>
                          <dd>{niceDate(detail.spec.deadline)}</dd>
                        </div>
                        <div>
                          <dt>Office</dt>
                          <dd>
                            {detail.spec.location || "Needs clarification"}
                          </dd>
                        </div>
                        <div>
                          <dt>Created</dt>
                          <dd>{niceDate(detail.created_at)}</dd>
                        </div>
                      </dl>
                    </div>
                    <div className="policy-checks">
                      <h3>
                        <ShieldCheck size={17} />
                        Policy references
                      </h3>
                      {policies.slice(0, 4).map((p) => (
                        <button
                          key={p.id}
                          onClick={() => {
                            setDetail(null);
                            setView("Policy library");
                          }}
                        >
                          <FileText size={13} />
                          <span>
                            {p.title}
                            <small>
                              {p.id} §{p.section}
                            </small>
                          </span>
                          <ArrowUpRight size={13} />
                        </button>
                      ))}
                    </div>
                    <p className="source-note">{detail.description}</p>
                  </aside>
                </div>
              )}
              {detailTab === "Supplier comparison" && (
                <div className="comparison">
                  <div className="comparison-intro">
                    <h3>
                      {isApprover
                        ? "Maya’s supplier review"
                        : "Every option, with the tradeoffs."}
                    </h3>
                    <p>
                      {isApprover
                        ? "Compare the offers, explain a different choice, then approve the exact proposal. This comparison and your reason are also visible to Pratham."
                        : "See the same supplier comparison Maya reviews, including the selected offer, prices, delivery, and exclusion reasons."}
                    </p>
                  </div>
                  <ComparisonSummary request={detail} />
                  {detail.quote?.selection_reason && (
                    <div className="shared-review">
                      <span className="avatar maya">MS</span>
                      <div>
                        <strong>Maya selected {detail.quote.vendor}</strong>
                        <p>{detail.quote.selection_reason}</p>
                      </div>
                    </div>
                  )}
                  {detail.candidates.length > 0 && (
                    <div className="offer-matrix table-scroll">
                      <table aria-label="Supplier offers side by side">
                        <thead>
                          <tr>
                            <th>COMPARE</th>
                            {detail.candidates.map((offer) => (
                              <th key={offer.id}>
                                <strong>{offer.vendor}</strong>
                                <small>
                                  {offer.id}
                                  {detail.quote?.id === offer.id
                                    ? " · Selected"
                                    : ""}
                                </small>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <th>Product</th>
                            {detail.candidates.map((offer) => (
                              <td key={offer.id}>{offer.product}</td>
                            ))}
                          </tr>
                          <tr>
                            <th>Total for {detail.spec.quantity} units</th>
                            {detail.candidates.map((offer) => (
                              <td className="matrix-price" key={offer.id}>
                                {money(offer.total)}
                              </td>
                            ))}
                          </tr>
                          <tr>
                            <th>Delivery</th>
                            {detail.candidates.map((offer) => (
                              <td key={offer.id}>
                                {offer.delivery_days} days
                                <small>Arrival {niceDate(offer.arrival)}</small>
                              </td>
                            ))}
                          </tr>
                          <tr>
                            <th>Available stock</th>
                            {detail.candidates.map((offer) => (
                              <td key={offer.id}>{offer.stock} units</td>
                            ))}
                          </tr>
                          {detail.spec.category === "laptop" && (
                            <tr>
                              <th>Memory</th>
                              {detail.candidates.map((offer) => (
                                <td key={offer.id}>{offer.ram_gb} GB RAM</td>
                              ))}
                            </tr>
                          )}
                          <tr>
                            <th>Policy eligibility</th>
                            {detail.candidates.map((offer) => (
                              <td key={offer.id}>
                                <span
                                  className={`supplier-status ${offer.eligible ? "good" : ""}`}
                                >
                                  {offer.eligible
                                    ? "Meets requirements"
                                    : "Excluded"}
                                </span>
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                  {isApprover && detail.status === "awaiting_approval" && (
                    <div className="review-selection-panel">
                      <label>
                        Reason for choosing a different supplier
                        <textarea
                          value={selectionReason}
                          onChange={(e) => setSelectionReason(e.target.value)}
                          rows={2}
                          maxLength={1000}
                          placeholder="For example: Orbit costs more but delivers two days earlier, which gives the team time to set up the laptops."
                        />
                      </label>
                      <p>
                        Required when changing the selection. Pratham will see
                        your explanation. Approval remains a separate step.
                      </p>
                    </div>
                  )}
                  {detail.candidates.length ? (
                    <div className="comparison-grid">
                      {detail.candidates.map((offer) => (
                        <article
                          className={`comparison-card ${detail.quote?.id === offer.id ? "recommended" : ""}`}
                          key={offer.id}
                        >
                          {detail.quote?.id === offer.id && (
                            <div className="recommended-label">
                              <Sparkles size={13} />
                              SELECTED PROPOSAL
                            </div>
                          )}
                          <span
                            className={`supplier-status ${offer.eligible ? "good" : ""}`}
                          >
                            {offer.eligible ? "Meets requirements" : "Excluded"}
                          </span>
                          <h3>{offer.vendor}</h3>
                          <p>{offer.product}</p>
                          <strong>
                            {money(offer.total)}
                            <small>
                              total for {detail.spec.quantity} units
                            </small>
                          </strong>
                          <div className="comparison-facts">
                            <span>
                              <Truck size={15} />
                              {offer.delivery_days} days delivery
                            </span>
                            <span>
                              <Package size={15} />
                              {offer.stock} units available
                            </span>
                          </div>
                          {offer.reasons.length ? (
                            <ul>
                              {offer.reasons.map((reason) => (
                                <li key={reason}>
                                  <XCircle size={14} />
                                  {reason}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="eligible-check">
                              <CheckCircle2 size={14} />
                              All policy checks passed
                            </div>
                          )}
                          {isApprover &&
                            detail.status === "awaiting_approval" &&
                            offer.eligible && (
                              <button
                                className={
                                  detail.quote?.id === offer.id
                                    ? "secondary full-width supplier-choice chosen"
                                    : "primary full-width supplier-choice"
                                }
                                aria-label={
                                  detail.quote?.id === offer.id
                                    ? `Selected offer ${offer.id}`
                                    : `Select ${offer.vendor} offer ${offer.id}`
                                }
                                disabled={
                                  !!busy ||
                                  detail.quote?.id === offer.id ||
                                  selectionReason.trim().length < 5
                                }
                                onClick={() =>
                                  mutateRequest(
                                    "selection",
                                    {
                                      revision: detail.revision,
                                      offer_id: offer.id,
                                      reason: selectionReason.trim(),
                                    },
                                    "Supplier choice shared with Pratham",
                                  )
                                }
                              >
                                {detail.quote?.id === offer.id ? (
                                  <>
                                    <Check size={14} />
                                    Selected proposal
                                  </>
                                ) : (
                                  <>
                                    Use this offer
                                    <ArrowRight size={14} />
                                  </>
                                )}
                              </button>
                            )}
                        </article>
                      ))}
                    </div>
                  ) : (
                    <Empty
                      title="Comparison is waiting on details"
                      text="Complete the requirements before the agent can evaluate suppliers."
                    />
                  )}
                  {isApprover && detail.status === "awaiting_approval" && (
                    <label className="review-note">
                      Approval note <span className="optional">optional</span>
                      <textarea
                        value={reviewNote}
                        onChange={(e) => setReviewNote(e.target.value)}
                        rows={2}
                        maxLength={1000}
                        placeholder="Add a note to share with Pratham…"
                      />
                    </label>
                  )}
                  {detail.quote?.selected_by && (
                    <details className="original-recommendation">
                      <summary>Agent’s original recommendation</summary>
                      <p>{detail.explanation}</p>
                    </details>
                  )}
                  <p className="muted-small">
                    Snapshot from the last investigation. Replan to refresh
                    availability and prices.
                  </p>
                </div>
              )}
              {detailTab === "Activity trail" && (
                <div className="activity-trail">
                  <div className="comparison-intro">
                    <h3>A clear trail from request to order.</h3>
                    <p>
                      Persisted workflow events and tool results.{" "}
                      {session?.agent_mode === "demo"
                        ? "This run uses deterministic offline decisions."
                        : "Model events include reported token usage."}
                    </p>
                  </div>
                  {detail.traces?.map((t) => (
                    <div className={`trace-item trace-${t.kind}`} key={t.id}>
                      <span className="trace-icon">
                        {t.kind === "tool" ? (
                          <Search size={15} />
                        ) : t.kind === "order" ? (
                          <Package size={15} />
                        ) : t.kind === "approval" ? (
                          <ShieldCheck size={15} />
                        ) : t.kind === "error" || t.kind === "recovery" ? (
                          <RefreshCw size={15} />
                        ) : (
                          <Activity size={15} />
                        )}
                      </span>
                      <div>
                        <div className="trace-heading">
                          <strong>{t.title.replaceAll("_", " ")}</strong>
                          <time>{fullDate(t.created_at)}</time>
                        </div>
                        <p>{t.detail}</p>
                        {Object.keys(t.payload).length > 0 && (
                          <details>
                            <summary>Inspect event data</summary>
                            <pre>{JSON.stringify(t.payload, null, 2)}</pre>
                          </details>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <footer className="detail-footer">
              <span>
                <ShieldCheck size={15} />
                {detail.status === "ordered"
                  ? "Order saved · duplicate retries are safe"
                  : `Proposal v${detail.revision} · separate human approval required`}
              </span>
              <div>
                {[
                  "blocked",
                  "needs_replan",
                  "failed",
                  "awaiting_approval",
                  "new",
                ].includes(detail.status) &&
                  !isApprover && (
                    <button
                      className="secondary"
                      disabled={!!busy}
                      onClick={() =>
                        mutateRequest("run", {}, "Proposal refreshed")
                      }
                    >
                      <RefreshCw size={15} />
                      {detail.status === "failed"
                        ? "Resume investigation"
                        : "Replan request"}
                    </button>
                  )}
                {detail.status === "awaiting_approval" &&
                  (isApprover ? (
                    <>
                      <button
                        className="secondary reject"
                        disabled={!!busy}
                        onClick={() =>
                          mutateRequest(
                            "review",
                            {
                              revision: detail.revision,
                              decision: "reject",
                              note: reviewNote,
                            },
                            "Request rejected",
                          )
                        }
                      >
                        Reject
                      </button>
                      <button
                        className="primary"
                        disabled={!!busy}
                        onClick={() =>
                          mutateRequest(
                            "review",
                            {
                              revision: detail.revision,
                              decision: "approve",
                              note: reviewNote,
                            },
                            "Proposal approved",
                          )
                        }
                      >
                        <Check size={16} />
                        Approve{" "}
                        {detail.quote ? money(detail.quote.total) : "proposal"}
                      </button>
                    </>
                  ) : (
                    session?.demo_auth && (
                      <button
                        className="primary"
                        disabled={!!busy}
                        onClick={() => switchPersona("approver")}
                      >
                        Review as Maya
                        <ArrowRight size={15} />
                      </button>
                    )
                  ))}
                {detail.status === "approved" &&
                  (!isApprover ? (
                    <button
                      className="primary"
                      disabled={!!busy}
                      onClick={() =>
                        mutateRequest("order", {}, "Purchase order created")
                      }
                    >
                      <Package size={16} />
                      Create purchase order
                    </button>
                  ) : (
                    session?.demo_auth && (
                      <button
                        className="primary"
                        disabled={!!busy}
                        onClick={() => switchPersona("requester")}
                      >
                        Continue as Pratham
                        <ArrowRight size={15} />
                      </button>
                    )
                  ))}
                {busy && <LoaderCircle size={18} className="spin" />}
              </div>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
