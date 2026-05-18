// ENGINE HEAD (in app.js zusammengefügt)
const ALLOWED_EMAIL_DOMAIN = "roots-consultants.com";
const WORKSPACE_ID = "a0000000-0000-4000-8000-000000000001";
const TIMER_KEY = "roots_time_active_timer_v2";

const CFG = (typeof window !== "undefined" && window.ROOTS_TIME_CONFIG) ? window.ROOTS_TIME_CONFIG : {};
const SUPABASE_URL = CFG.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = CFG.SUPABASE_ANON_KEY || "";
let supabase = null;
let sessionUser = null;
let workspaceChannel = null;
let reloadDebounce = null;

const PROJECT_COLORS = [
  "#206efb", "#10b981", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#ef4444", "#64748b"
];

const TASK_TYPES = {
  standard: { label: "Standard", icon: "fa-clock", color: "#206efb" },
  travel: { label: "Reise", icon: "fa-car", color: "#f59e0b" },
  expense: { label: "Spesen", icon: "fa-receipt", color: "#8b5cf6" },
  flatrate: { label: "Pauschale", icon: "fa-coins", color: "#10b981" },
  holiday: { label: "Urlaub", icon: "fa-umbrella-beach", color: "#475569" },
  fixedcost: { label: "Fixkosten", icon: "fa-file-invoice", color: "#64748b" },
};

let state = {
  profile: { name: "", role: "member", rate: 80, weeklyHours: 40 },
  categories: [],
  projects: [],
  tasks: [],
  entries: [],
  members: [],
  settings: {
    stopNote: true,
    multiTimer: false,
    autoStop: true,
    remTimer: false,
    remEndDay: false,
    remBudget: false,
    remBreak: false,
  },
  activeTimer: null,
  selectedProjectId: null,
  expandedProjects: new Set(),
  collapsedCategories: new Set(),
  calCurrent: new Date(),
};

function isAllowedEmail(email) {
  if (!email || typeof email !== "string") return false;
  const e = email.trim().toLowerCase();
  return e.endsWith("@" + ALLOWED_EMAIL_DOMAIN);
}

function initSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
}

function setSyncUi(ok) {
  const banner = document.getElementById("configBanner");
  const sync = document.getElementById("syncLabel");
  const badge = document.getElementById("syncBadge");
  if (banner) banner.style.display = ok ? "none" : "flex";
  if (sync) sync.textContent = ok ? "Live-Sync" : "Offline";
  if (badge) badge.classList.toggle("offline", !ok);
}

function mapCategory(r) {
  return { id: r.id, workspace_id: r.workspace_id, name: r.name, color: r.color };
}
function mapProject(r) {
  return {
    id: r.id,
    workspace_id: r.workspace_id,
    categoryId: r.category_id,
    name: r.name,
    color: r.color,
    startDate: r.start_date || "",
    dueDate: r.due_date || "",
    hourlyRate: Number(r.hourly_rate) || 0,
    plannedHours: Number(r.planned_hours) || 0,
    plannedBudget: Number(r.planned_budget) || 0,
    billable: !!r.billable,
    trackingMode: r.tracking_mode || "slot",
    archived: !!r.archived,
    notes: r.notes || "",
  };
}
function mapTask(r) {
  return {
    id: r.id,
    projectId: r.project_id,
    parentTaskId: r.parent_task_id,
    name: r.name,
    type: r.type || "standard",
    plannedHours: Number(r.planned_hours) || 0,
    completed: !!r.completed,
    sortOrder: r.sort_order || 0,
  };
}
function mapEntry(r) {
  return {
    id: r.id,
    taskId: r.task_id,
    userName: r.user_display_name || "",
    userId: r.user_id,
    startTime: r.start_time,
    endTime: r.end_time,
    durationSeconds: r.duration_seconds,
    note: r.note || "",
    billingStatus: r.billing_status || "open",
  };
}
function mapMemberProfile(r) {
  return {
    id: r.id,
    name: r.full_name || r.email || "",
    role: r.app_role === "admin" ? "admin" : "member",
    rate: Number(r.hourly_rate) || 0,
    weeklyHours: Number(r.weekly_hours) || 40,
  };
}

async function loadWorkspaceData() {
  if (!supabase || !sessionUser) return;

  const uid = sessionUser.id;
  const { data: prof, error: pe } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
  if (pe) console.warn(pe);

  if (prof) {
    state.profile.name = prof.full_name || "";
    state.profile.role = prof.app_role === "admin" ? "admin" : "member";
    state.profile.rate = Number(prof.hourly_rate) || 80;
    state.profile.weeklyHours = Number(prof.weekly_hours) || 40;
    if (prof.app_settings && typeof prof.app_settings === "object") {
      state.settings = { ...state.settings, ...prof.app_settings };
    }
  }

  const { data: cats, error: ce } = await supabase.from("categories").select("*").eq("workspace_id", WORKSPACE_ID);
  if (ce) throw ce;
  state.categories = (cats || []).map(mapCategory);

  const { data: projs, error: pje } = await supabase.from("projects").select("*").eq("workspace_id", WORKSPACE_ID);
  if (pje) throw pje;
  state.projects = (projs || []).map(mapProject);

  const projectIds = state.projects.map((p) => p.id);
  let tasks = [];
  if (projectIds.length) {
    const { data: tk, error: te } = await supabase.from("tasks").select("*").in("project_id", projectIds);
    if (te) throw te;
    tasks = tk || [];
  }
  state.tasks = tasks.map(mapTask);

  const taskIds = state.tasks.map((t) => t.id);
  let entries = [];
  if (taskIds.length) {
    const { data: en, error: ee } = await supabase.from("time_entries").select("*").in("task_id", taskIds);
    if (ee) throw ee;
    entries = en || [];
  }
  state.entries = entries.map(mapEntry);

  const { data: memberRows, error: me } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", WORKSPACE_ID);
  if (me) throw me;
  const userIds = [...new Set((memberRows || []).map((m) => m.user_id))];
  let members = [];
  if (userIds.length) {
    const { data: prs, error: pre } = await supabase.from("profiles").select("*").in("id", userIds);
    if (pre) throw pre;
    members = (prs || []).map(mapMemberProfile);
  }
  state.members = members;

  const rawTimer = localStorage.getItem(TIMER_KEY);
  if (rawTimer) {
    try {
      state.activeTimer = JSON.parse(rawTimer);
    } catch (_) {}
  }
}

function scheduleReloadCoalesced() {
  clearTimeout(reloadDebounce);
  reloadDebounce = setTimeout(async () => {
    try {
      await loadWorkspaceData();
      refreshUser();
      const nav = document.querySelector(".nav-item.is-active");
      const v = nav ? nav.dataset.view : "projects";
      switchView(v);
    } catch (e) {
      console.warn(e);
    }
  }, 120);
}

function subscribeWorkspaceRealtime() {
  if (!supabase) return;
  if (workspaceChannel) {
    supabase.removeChannel(workspaceChannel);
    workspaceChannel = null;
  }
  workspaceChannel = supabase
    .channel("rt_workspace_" + WORKSPACE_ID)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "projects", filter: `workspace_id=eq.${WORKSPACE_ID}` },
      scheduleReloadCoalesced
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "categories", filter: `workspace_id=eq.${WORKSPACE_ID}` },
      scheduleReloadCoalesced
    )
    .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, scheduleReloadCoalesced)
    .on("postgres_changes", { event: "*", schema: "public", table: "time_entries" }, scheduleReloadCoalesced)
    .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, scheduleReloadCoalesced)
    .subscribe();
}

function showAuthGate(show) {
  const g = document.getElementById("authGate");
  const app = document.getElementById("mainApp");
  if (g) g.style.display = show ? "flex" : "none";
  if (app) app.style.display = show ? "none" : "";
}

function showAuthError(msg) {
  const el = document.getElementById("authError");
  if (el) el.textContent = msg || "";
}

async function handleSignIn(e) {
  e.preventDefault();
  showAuthError("");
  if (!supabase) {
    showAuthError("Supabase ist nicht konfiguriert (config.js).");
    return;
  }
  const email = document.getElementById("authEmail").value.trim();
  const pw = document.getElementById("authPassword").value;
  if (!isAllowedEmail(email)) {
    showAuthError("Nur E-Mail-Adressen @" + ALLOWED_EMAIL_DOMAIN + " sind erlaubt.");
    return;
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
  if (error) showAuthError(error.message);
}

async function handleSignUp(e) {
  e.preventDefault();
  showAuthError("");
  if (!supabase) {
    showAuthError("Supabase ist nicht konfiguriert (config.js).");
    return;
  }
  const email = document.getElementById("regEmail").value.trim();
  const pw = document.getElementById("regPassword").value;
  const name = document.getElementById("regName").value.trim();
  if (!isAllowedEmail(email)) {
    showAuthError("Nur E-Mail-Adressen @" + ALLOWED_EMAIL_DOMAIN + " sind erlaubt.");
    return;
  }
  if (pw.length < 8) {
    showAuthError("Passwort mindestens 8 Zeichen.");
    return;
  }
  const { error } = await supabase.auth.signUp({
    email,
    password: pw,
    options: { data: { full_name: name } },
  });
  if (error) showAuthError(error.message);
  else {
    showAuthError("");
    alert("Falls E-Mail-Bestätigung aktiv ist: Link im Postfach öffnen, danach anmelden.");
  }
}

async function handleSignOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

function wireAuthForms() {
  document.getElementById("formLogin")?.addEventListener("submit", handleSignIn);
  document.getElementById("formRegister")?.addEventListener("submit", handleSignUp);
  document.getElementById("btnLogout")?.addEventListener("click", () => void handleSignOut());
}

async function onSession(user) {
  sessionUser = user;
  if (!user) {
    showAuthGate(true);
    setSyncUi(false);
    if (workspaceChannel && supabase) {
      supabase.removeChannel(workspaceChannel);
      workspaceChannel = null;
    }
    return;
  }
  showAuthGate(false);
  setSyncUi(true);
  try {
    await loadWorkspaceData();
    subscribeWorkspaceRealtime();
    refreshUser();
    renderProjects();
  } catch (err) {
    console.error(err);
    toast("Daten konnten nicht geladen werden: " + (err.message || err), "error");
  }
}

let _profSaveT = null;
async function flushProfileToDb() {
  if (!supabase || !sessionUser) return;
  await supabase
    .from("profiles")
    .update({
      full_name: state.profile.name,
      hourly_rate: state.profile.rate,
      weekly_hours: state.profile.weeklyHours,
      app_role: state.profile.role === "admin" ? "admin" : "member",
      app_settings: state.settings,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionUser.id);
}

function saveLocal() {
  try {
    localStorage.setItem(TIMER_KEY, JSON.stringify(state.activeTimer));
  } catch (_) {}
  clearTimeout(_profSaveT);
  _profSaveT = setTimeout(() => void flushProfileToDb(), 700);
}

async function boot() {
  initSupabaseClient();
  wireAuthForms();
  if (!supabase) {
    setSyncUi(false);
    toast("Supabase nicht konfiguriert", "error");
    return;
  }
  const {
    data: { session },
  } = await supabase.auth.getSession();
  await onSession(session?.user ?? null);
  supabase.auth.onAuthStateChange((_event, session) => {
    void onSession(session?.user ?? null);
  });
}
