// ENGINE HEAD (in app.js zusammengefügt)
/** Erhöhen bei jedem GitHub-Pages-Deploy, um die ausgelieferte Version zu erkennen */
const APP_DISPLAY_VERSION = "1";

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

/** Redirect nach E-Mail-Link (Supabase Dashboard: „Redirect URLs“ muss diese URL erlauben) */
function getAuthRedirectUrl() {
  if (typeof window === "undefined") return "";
  const { origin, pathname, search } = window.location;
  return `${origin}${pathname}${search}`;
}

let pendingConfirmationEmail = null;

function showAuthFeedback(message, kind = "") {
  const el = document.getElementById("authFeedback");
  if (!el) return;
  el.textContent = message || "";
  el.className = "auth-feedback" + (kind ? ` auth-feedback--${kind}` : "");
}

function setResendVisible(email) {
  pendingConfirmationEmail = (email && String(email).trim()) || null;
  const row = document.getElementById("authResendRow");
  if (row) row.hidden = !pendingConfirmationEmail;
}

/** Vollständige Auth-Fehler in die Konsole (F12), für Supabase-Diagnose */
function logAuthErr(phase, err) {
  console.error("[ROOTS TIME Auth]", phase, err?.message, err?.code || "", err?.status || "", err);
}

/** Deutsche Kurztexte für typische Supabase-Auth-Fehler */
function formatAuthError(err) {
  if (!err || typeof err.message !== "string") return "Anmeldung fehlgeschlagen.";
  const m = err.message;
  if (/Invalid login credentials|invalid login/i.test(m)) {
    return "E-Mail oder Passwort ist falsch.";
  }
  if (/Email not confirmed|not confirmed|email address is not confirmed/i.test(m)) {
    return "Diese E-Mail ist noch nicht bestätigt. Bitte zuerst den Link in der Bestätigungs-E-Mail öffnen (Posteingang & Spam prüfen). Danach können Sie sich hier anmelden.";
  }
  if (/Email rate limit|too many requests|rate limit|over_email_send_rate_limit/i.test(m)) {
    return "Zu viele Versuche. Bitte kurz warten und erneut versuchen.";
  }
  if (/User already registered|already been registered|already exists/i.test(m)) {
    return "Diese E-Mail ist bereits registriert. Bitte beim Tab „Anmelden“ einloggen.";
  }
  if (/Password should be at least|Password is too weak|weak password/i.test(m)) {
    return "Passwort erfüllt die Anforderungen nicht (mindestens 8 Zeichen, ggf. stärker wählen).";
  }
  if (/signups not allowed|signup.*not.*allowed|Signups not allowed/i.test(m)) {
    return "Registrierung ist im Supabase-Projekt deaktiviert. Dashboard → Authentication → Providers → E-Mail → „Allow new users to sign up“ aktivieren.";
  }
  if (/signup.*disabled|email signup.*disabled|Email provider is disabled/i.test(m)) {
    return "E-Mail-Registrierung ist im Supabase-Projekt ausgeschaltet (Provider / E-Mail).";
  }
  if (/Nur firmeninterne E-Mail-Adressen/i.test(m)) {
    return m;
  }
  if (/Database error saving new user|unexpected_failure/i.test(m)) {
    return "Datenbankfehler beim Anlegen des Kontos (häufig: Trigger nach Registrierung). Bitte Supabase → Logs → Postgres prüfen oder Administrator informieren.";
  }
  if (/Error sending confirmation|confirmation email could not|535|SMTP|authentication failed/i.test(m)) {
    return "Die Bestätigungs-E-Mail konnte nicht versendet werden. Supabase → Project Settings → Authentication: E-Mail-Versand / SMTP prüfen.";
  }
  return m;
}

async function handleResendConfirmation() {
  if (!supabase) return;
  const email =
    pendingConfirmationEmail ||
    document.getElementById("authEmail")?.value?.trim() ||
    document.getElementById("regEmail")?.value?.trim() ||
    "";
  if (!email) {
    showAuthFeedback("Bitte zuerst Ihre E-Mail-Adresse eintragen.", "error");
    return;
  }
  if (!isAllowedEmail(email)) {
    showAuthFeedback("Nur E-Mail-Adressen @" + ALLOWED_EMAIL_DOMAIN + " sind erlaubt.", "error");
    return;
  }
  const btn = document.getElementById("authResendBtn");
  if (btn) {
    btn.disabled = true;
    btn.dataset.prev = btn.textContent;
    btn.textContent = "Wird gesendet…";
  }
  try {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: getAuthRedirectUrl() },
    });
    if (error) {
      logAuthErr("resendConfirmation", error);
      showAuthFeedback(formatAuthError(error), "error");
    } else {
      showAuthFeedback(
        "Sofern die Adresse noch nicht bestätigt ist, haben wir eine neue E-Mail an " + email + " geschickt. Posteingang und Spam prüfen.",
        "success"
      );
    }
  } catch (e) {
    console.error(e);
    showAuthFeedback(e?.message || "E-Mail konnte nicht gesendet werden.", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      if (btn.dataset.prev) {
        btn.textContent = btn.dataset.prev;
        delete btn.dataset.prev;
      }
    }
  }
}

async function handleSignIn(e) {
  e.preventDefault();
  showAuthFeedback("");
  setResendVisible(null);
  if (!supabase) {
    showAuthFeedback("Supabase ist nicht konfiguriert (config.js).", "error");
    return;
  }
  const email = document.getElementById("authEmail").value.trim();
  const pw = document.getElementById("authPassword").value;
  if (!isAllowedEmail(email)) {
    showAuthFeedback("Nur E-Mail-Adressen @" + ALLOWED_EMAIL_DOMAIN + " sind erlaubt.", "error");
    return;
  }
  const form = e.target;
  const submitBtn = form?.querySelector?.('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.dataset.prevLabel = submitBtn.textContent;
    submitBtn.textContent = "Bitte warten…";
  }
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pw });
    if (error) {
      logAuthErr("signIn", error);
      const msg = formatAuthError(error);
      showAuthFeedback(msg, "error");
      const raw = error.message || "";
      if (/Email not confirmed|not confirmed|email address is not confirmed/i.test(raw)) {
        setResendVisible(email);
      }
      return;
    }
    const session = data.session ?? (await supabase.auth.getSession()).data?.session;
    if (!session?.user) {
      showAuthFeedback(
        "Keine aktive Sitzung. Wenn Ihr Projekt E-Mail-Bestätigung vorschreibt: zuerst den Link in der E-Mail öffnen, dann hier anmelden.",
        "info"
      );
      setResendVisible(email);
      return;
    }
    await onSession(session.user);
  } catch (err) {
    console.error(err);
    showAuthFeedback(err?.message || "Unerwarteter Fehler bei der Anmeldung.", "error");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      if (submitBtn.dataset.prevLabel) {
        submitBtn.textContent = submitBtn.dataset.prevLabel;
        delete submitBtn.dataset.prevLabel;
      }
    }
  }
}

async function handleSignUp(e) {
  e.preventDefault();
  showAuthFeedback("");
  setResendVisible(null);
  if (!supabase) {
    showAuthFeedback("Supabase ist nicht konfiguriert (config.js).", "error");
    return;
  }
  const email = document.getElementById("regEmail").value.trim();
  const pw = document.getElementById("regPassword").value;
  const name = document.getElementById("regName").value.trim();
  if (!isAllowedEmail(email)) {
    showAuthFeedback("Nur E-Mail-Adressen @" + ALLOWED_EMAIL_DOMAIN + " sind erlaubt.", "error");
    return;
  }
  if (pw.length < 8) {
    showAuthFeedback("Passwort mindestens 8 Zeichen.", "error");
    return;
  }
  const form = e.target;
  const submitBtn = form?.querySelector?.('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.dataset.prevLabel = submitBtn.textContent;
    submitBtn.textContent = "Bitte warten…";
  }
  try {
    const redirectTo = getAuthRedirectUrl();
    const { data, error } = await supabase.auth.signUp({
      email,
      password: pw,
      options: {
        emailRedirectTo: redirectTo,
        data: { full_name: name },
      },
    });
    if (error) {
      logAuthErr("signUp", error);
      showAuthFeedback(formatAuthError(error), "error");
      return;
    }
    if (!data.user) {
      console.error("[ROOTS TIME Auth] signUp OK but no data.user", data);
      showAuthFeedback(
        "Die Registrierung wurde nicht abgeschlossen (kein Benutzerkonto angelegt). " +
          "Bitte im Browser die Konsole öffnen (F12 → Konsole) und in Supabase unter Authentication prüfen, ob neue Nutzer erlaubt sind. " +
          "Häufig: Datenbank-Trigger beim Anlegen/Falsche E-Mail-Domain.",
        "error"
      );
      return;
    }
    if (data.session?.user) {
      showAuthFeedback("");
      await onSession(data.session.user);
      return;
    }
    const loginEmail = document.getElementById("authEmail");
    if (loginEmail) loginEmail.value = email;
    const loginRadio = document.getElementById("auth-tab-login");
    const registerRadio = document.getElementById("auth-tab-register");
    if (loginRadio) loginRadio.checked = true;
    if (registerRadio) registerRadio.checked = false;

    showAuthFeedback(
      "Wir haben eine Bestätigungs-E-Mail an " +
        email +
        " gesendet. Bitte den Link in der Mail öffnen (auch Spam prüfen). Erst danach ist die Anmeldung hier möglich – Daten werden danach live mit Supabase synchronisiert.",
      "success"
    );
    setResendVisible(email);
  } catch (err) {
    console.error(err);
    showAuthFeedback(err?.message || "Registrierung fehlgeschlagen.", "error");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      if (submitBtn.dataset.prevLabel) {
        submitBtn.textContent = submitBtn.dataset.prevLabel;
        delete submitBtn.dataset.prevLabel;
      }
    }
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
  document.getElementById("authResendBtn")?.addEventListener("click", () => void handleResendConfirmation());
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
  showAuthFeedback("");
  setResendVisible(null);
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

function applyVersionBadge() {
  const el = document.getElementById("appVersionBadge");
  if (el) el.textContent = "v" + APP_DISPLAY_VERSION;
}

async function boot() {
  applyVersionBadge();
  initSupabaseClient();
  wireAuthForms();
  if (!supabase) {
    setSyncUi(false);
    console.error("[ROOTS TIME] Kein Supabase-Client: Prüfen Sie config.js (SUPABASE_URL / ANON_KEY).");
    toast("Supabase nicht konfiguriert", "error");
    return;
  }
  console.info("[ROOTS TIME] Supabase-Client:", SUPABASE_URL);
  const {
    data: { session },
  } = await supabase.auth.getSession();
  await onSession(session?.user ?? null);
  supabase.auth.onAuthStateChange((_event, session) => {
    void onSession(session?.user ?? null);
  });
}
