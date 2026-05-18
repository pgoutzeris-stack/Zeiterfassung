/* =========================================================
   ROOTS TIME · JS APP LOGIC
   =========================================================
   Speicherung:
   - Default: LocalStorage (funktioniert ohne Setup)
   - Wenn SUPABASE_URL + SUPABASE_KEY gesetzt: Supabase + Realtime
   ========================================================= */

// ===== Supabase Config =====
const CFG = (typeof window !== "undefined" && window.ROOTS_TIME_CONFIG) ? window.ROOTS_TIME_CONFIG : {};
const SUPABASE_URL = CFG.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = CFG.SUPABASE_ANON_KEY || "";
const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let supabase = null;
if (USE_SUPABASE) {
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  document.getElementById("configBanner").style.display = "none";
  document.getElementById("syncLabel").textContent = "Live-Sync";
} else {
  document.getElementById("syncBadge").classList.add("offline");
}

// ===== Project Colors =====
const PROJECT_COLORS = [
  '#206efb', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#ef4444', '#64748b'
];

const TASK_TYPES = {
  standard: { label: 'Standard', icon: 'fa-clock', color: '#206efb' },
  travel:   { label: 'Reise',    icon: 'fa-car',   color: '#f59e0b' },
  expense:  { label: 'Spesen',   icon: 'fa-receipt', color: '#8b5cf6' },
  flatrate: { label: 'Pauschale', icon: 'fa-coins', color: '#10b981' },
  holiday:  { label: 'Urlaub',   icon: 'fa-umbrella-beach', color: '#475569' },
  fixedcost:{ label: 'Fixkosten', icon: 'fa-file-invoice', color: '#64748b' }
};

// ===== State =====
let state = {
  profile:    { name: '', role: 'member', rate: 80, weeklyHours: 40 },
  categories: [],
  projects:   [],
  tasks:      [],
  entries:    [],
  members:    [],
  settings:   { stopNote: true, multiTimer: false, autoStop: true,
                remTimer: false, remEndDay: false, remBudget: false, remBreak: false },
  activeTimer: null,    // { taskId, startTime }
  selectedProjectId: null,
  expandedProjects: new Set(),
  collapsedCategories: new Set(),
  calCurrent: new Date(),
};

// ===== Storage =====
const STORAGE_KEY = 'roots_time_v1';
let _remotePushTimer = null;

function getStatePayload() {
  return {
    profile: state.profile,
    categories: state.categories,
    projects: state.projects,
    tasks: state.tasks,
    entries: state.entries,
    members: state.members,
    settings: state.settings,
    activeTimer: state.activeTimer
  };
}

function applyPayload(data) {
  if (!data || typeof data !== "object") return;
  state.profile = data.profile || state.profile;
  state.categories = data.categories || [];
  state.projects = data.projects || [];
  state.tasks = data.tasks || [];
  state.entries = data.entries || [];
  state.members = data.members || [];
  state.settings = { ...state.settings, ...(data.settings || {}) };
  state.activeTimer = data.activeTimer != null ? data.activeTimer : null;
  state.expandedProjects = new Set();
  state.collapsedCategories = new Set();
}

function saveLocal() {
  const data = getStatePayload();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  schedulePushRemote();
}

function schedulePushRemote() {
  if (!USE_SUPABASE || !supabase) return;
  clearTimeout(_remotePushTimer);
  _remotePushTimer = setTimeout(() => { pushRemote(); }, 450);
}

async function pushRemote() {
  if (!USE_SUPABASE || !supabase) return;
  const payload = getStatePayload();
  try {
    const { error } = await supabase.from("roots_time_workspace").upsert({
      id: "default",
      payload: payload,
      updated_at: new Date().toISOString()
    });
    if (error) console.warn("roots_time_workspace push:", error);
  } catch (e) {
    console.warn("pushRemote", e);
  }
}

function loadLocal() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) { seedDemo(); return; }
  try {
    const data = JSON.parse(raw);
    applyPayload(data);
  } catch (e) {
    console.error(e);
    seedDemo();
  }
}

async function loadFromSupabase() {
  const { data, error } = await supabase
    .from("roots_time_workspace")
    .select("payload")
    .eq("id", "default")
    .maybeSingle();
  if (error) throw error;
  return data && data.payload ? data.payload : null;
}

// ===== Demo-Daten =====
function seedDemo() {
  state.categories = [
    { id: 'c1', name: 'ROOTS Internal', color: '#206efb' },
    { id: 'c2', name: 'Kunde Beispiel GmbH', color: '#10b981' }
  ];
  state.projects = [
    { id: 'p1', categoryId: 'c1', name: 'ROOTS TIME App', color: '#206efb',
      startDate: '2026-04-01', dueDate: '2026-06-30', hourlyRate: 0,
      plannedHours: 40, plannedBudget: 0, billable: false,
      trackingMode: 'slot', archived: false, notes: '' },
    { id: 'p2', categoryId: 'c2', name: 'Brand Strategy Workshop', color: '#10b981',
      startDate: '2026-04-10', dueDate: '2026-05-31', hourlyRate: 180,
      plannedHours: 60, plannedBudget: 10800, billable: true,
      trackingMode: 'slot', archived: false, notes: '' }
  ];
  state.tasks = [
    { id: 't1', projectId: 'p1', parentTaskId: null, name: 'Konzept', type: 'standard', plannedHours: 8, completed: false, sortOrder: 0 },
    { id: 't2', projectId: 'p1', parentTaskId: null, name: 'Frontend', type: 'standard', plannedHours: 24, completed: false, sortOrder: 1 },
    { id: 't3', projectId: 'p1', parentTaskId: null, name: 'Testing', type: 'standard', plannedHours: 8, completed: false, sortOrder: 2 },
    { id: 't4', projectId: 'p2', parentTaskId: null, name: 'Discovery', type: 'standard', plannedHours: 16, completed: false, sortOrder: 0 },
    { id: 't5', projectId: 'p2', parentTaskId: null, name: 'Brand Audit', type: 'standard', plannedHours: 24, completed: false, sortOrder: 1 },
    { id: 't6', projectId: 'p2', parentTaskId: null, name: 'Reise München', type: 'travel', plannedHours: 6, completed: false, sortOrder: 2 }
  ];
  const today = new Date();
  const yest = new Date(today); yest.setDate(today.getDate() - 1);
  state.entries = [
    { id: 'e1', taskId: 't1', userName: 'Demo', startTime: addTime(yest, 9), endTime: addTime(yest, 11), durationSeconds: 7200, note: 'Erste Konzeptphase', billingStatus: 'open' },
    { id: 'e2', taskId: 't4', userName: 'Demo', startTime: addTime(yest, 13), endTime: addTime(yest, 16), durationSeconds: 10800, note: 'Stakeholder-Interviews', billingStatus: 'open' },
    { id: 'e3', taskId: 't2', userName: 'Demo', startTime: addTime(today, 9, 30), endTime: addTime(today, 12), durationSeconds: 9000, note: '', billingStatus: 'open' }
  ];
  state.members = [
    { id: 'm1', name: 'Demo', role: 'admin', rate: 80, weeklyHours: 40 }
  ];
}

function addTime(date, h, m=0) {
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

// ===== Utils =====
function uid(prefix='id') { return prefix + '_' + Math.random().toString(36).slice(2,11); }
function fmtDur(seconds) {
  seconds = Math.max(0, Math.floor(seconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function fmtHM(seconds) {
  seconds = Math.max(0, Math.floor(seconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}:${String(m).padStart(2,'0')}`;
}
function initials(name) {
  if (!name) return '??';
  return name.split(' ').map(p => p[0]).slice(0,2).join('').toUpperCase();
}
function entryDuration(entry) {
  if (entry.endTime) return entry.durationSeconds || 0;
  // Läuft noch:
  return Math.floor((Date.now() - new Date(entry.startTime).getTime()) / 1000);
}
function todayISO() { return new Date().toISOString().slice(0,10); }
function isToday(iso) { return iso.slice(0,10) === todayISO(); }

function toast(msg, type='success', undoFn=null) {
  const t = document.createElement('div');
  t.className = 'toast' + (type === 'error' ? ' error' : (type === 'info' ? ' info' : ''));
  const icon = type === 'error' ? 'fa-circle-exclamation' : (type === 'info' ? 'fa-circle-info' : 'fa-circle-check');
  t.innerHTML = `<i class="fa-solid ${icon}"></i><span class="toast-msg">${msg}</span>`;
  if (undoFn) {
    const btn = document.createElement('button');
    btn.className = 'toast-undo';
    btn.textContent = 'Rückgängig';
    btn.onclick = () => { undoFn(); t.remove(); };
    t.appendChild(btn);
  }
  document.getElementById('toast-container').appendChild(t);
  setTimeout(() => t.remove(), 5000);
}

// ===== Modal =====
const modal = {
  open(title, bodyHTML, footerHTML='') {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = bodyHTML;
    document.getElementById('modalFooter').innerHTML = footerHTML;
    document.getElementById('modalOverlay').classList.add('is-open');
  },
  close() {
    document.getElementById('modalOverlay').classList.remove('is-open');
  }
};
document.getElementById('modalCloseBtn').onclick = () => modal.close();
document.getElementById('modalOverlay').onclick = (e) => {
  if (e.target.id === 'modalOverlay') modal.close();
};

// ===== Navigation =====
function switchView(view) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('is-active', el.dataset.view === view));
  document.querySelectorAll('.view').forEach(el => el.classList.toggle('is-active', el.dataset.viewContent === view));

  if (view === 'today')    renderToday();
  if (view === 'calendar') renderCalendar();
  if (view === 'stats')    renderStats();
  if (view === 'team')     renderTeam();
  if (view === 'settings') renderSettings();
  if (view === 'projects') renderProjects();
}
document.querySelectorAll('.nav-item').forEach(el => {
  el.onclick = () => switchView(el.dataset.view);
});

// ===== PROJEKTE RENDER =====
function renderProjects() {
  const wrap = document.getElementById('projectsList');
  if (state.projects.length === 0 && state.categories.length === 0) {
    wrap.innerHTML = `
      <div class="empty-state" style="padding: 40px 20px;">
        <i class="fa-solid fa-folder-plus"></i>
        <h4>Noch keine Projekte</h4>
        <p>Lege dein erstes Projekt an, um Zeit zu erfassen.</p>
        <button class="btn-primary" onclick="openProjectModal()"><i class="fa-solid fa-plus"></i> Neues Projekt</button>
      </div>`;
    return;
  }

  let html = '';

  // Projekte ohne Kategorie zuerst
  const uncategorized = state.projects.filter(p => !p.categoryId && !p.archived);
  if (uncategorized.length) {
    html += renderProjectGroup('Ohne Kategorie', null, uncategorized);
  }

  state.categories.forEach(cat => {
    const projs = state.projects.filter(p => p.categoryId === cat.id && !p.archived);
    if (projs.length === 0) return;
    html += renderProjectGroup(cat.name, cat.id, projs);
  });

  html += `<button class="add-project-btn" onclick="openProjectModal()"><i class="fa-solid fa-plus"></i> Neues Projekt</button>`;
  wrap.innerHTML = html;

  // Detail-Panel
  renderProjectDetail();
}

function renderProjectGroup(label, catId, projs) {
  const collapsed = catId && state.collapsedCategories.has(catId);
  let html = `<div class="category ${collapsed ? 'collapsed' : ''}">`;
  html += `<div class="category-header" onclick="toggleCategory('${catId || ''}')">
    <i class="fa-solid fa-chevron-down chevron"></i>
    <span>${escapeHtml(label)}</span>
    <span style="margin-left:auto; color: var(--muted); font-weight: 500;">${projs.length}</span>
  </div><div class="category-body">`;

  projs.forEach(p => {
    const tasks = state.tasks.filter(t => t.projectId === p.id);
    const expanded = state.expandedProjects.has(p.id);
    const selected = state.selectedProjectId === p.id;
    const totalSec = state.entries.filter(e => tasks.some(t => t.id === e.taskId)).reduce((s,e) => s + entryDuration(e), 0);
    const plannedSec = (p.plannedHours || 0) * 3600;
    const pct = plannedSec > 0 ? Math.min(100, (totalSec / plannedSec) * 100) : 0;
    const barClass = pct > 100 ? 'over' : (pct > 80 ? 'warn' : '');

    html += `<div class="project-card ${expanded ? 'is-expanded' : ''} ${selected ? 'is-selected' : ''}" data-pid="${p.id}">`;
    html += `<div class="project-card-header" onclick="selectProject('${p.id}'); toggleProject('${p.id}');">
      <i class="fa-solid fa-chevron-right chevron" style="font-size: 10px; color: var(--muted); transition: transform .2s;"></i>
      <span class="project-color-dot" style="background:${p.color}"></span>
      <div class="project-info">
        <div class="project-name">${escapeHtml(p.name)}</div>
        <div class="project-meta">${fmtHM(totalSec)} ${plannedSec ? ' / ' + fmtHM(plannedSec) : ''} ${p.billable ? '· abrechenbar' : ''}</div>
        ${plannedSec ? `<div class="project-progress-mini"><div class="bar ${barClass}" style="width:${pct}%"></div></div>` : ''}
      </div>
    </div>`;

    if (expanded) {
      html += `<div class="project-card-body">`;
      const rootTasks = tasks.filter(t => !t.parentTaskId).sort((a,b) => a.sortOrder - b.sortOrder);
      rootTasks.forEach(t => {
        html += renderTaskRow(t, tasks);
      });
      html += `<button class="add-row" onclick="event.stopPropagation(); openTaskModal('${p.id}')"><i class="fa-solid fa-plus"></i> Aufgabe hinzufügen</button>`;
      html += `</div>`;
    }
    html += `</div>`;
  });

  html += `</div></div>`;
  return html;
}

function renderTaskRow(t, allTasks) {
  const totalSec = state.entries.filter(e => e.taskId === t.id).reduce((s,e) => s + entryDuration(e), 0);
  const isRunning = state.activeTimer && state.activeTimer.taskId === t.id;
  const type = TASK_TYPES[t.type] || TASK_TYPES.standard;
  let html = `<div class="task-row">
    <button class="play-btn ${isRunning ? 'is-running' : ''}" onclick="event.stopPropagation(); toggleTimer('${t.id}')" title="${isRunning ? 'Stoppen' : 'Starten'}">
      <i class="fa-solid ${isRunning ? 'fa-pause' : 'fa-play'}" style="font-size: 10px;"></i>
    </button>
    <span class="task-name">${escapeHtml(t.name)}</span>
    ${t.type !== 'standard' ? `<span class="task-type-badge"><i class="fa-solid ${type.icon}"></i> ${type.label}</span>` : ''}
    <span class="task-time">${fmtHM(totalSec)}</span>
  </div>`;
  return html;
}

function toggleProject(pid) {
  if (state.expandedProjects.has(pid)) state.expandedProjects.delete(pid);
  else state.expandedProjects.add(pid);
  renderProjects();
}

function toggleCategory(cid) {
  if (!cid) return;
  if (state.collapsedCategories.has(cid)) state.collapsedCategories.delete(cid);
  else state.collapsedCategories.add(cid);
  renderProjects();
}

function selectProject(pid) {
  state.selectedProjectId = pid;
  renderProjectDetail();
}

function renderProjectDetail() {
  const wrap = document.getElementById('projectDetail');
  const p = state.projects.find(x => x.id === state.selectedProjectId);
  if (!p) {
    wrap.innerHTML = `
      <div class="detail-empty">
        <i class="fa-solid fa-folder-open"></i>
        <p>Wähle ein Projekt aus, um Details zu sehen.</p>
      </div>`;
    return;
  }

  const tasks = state.tasks.filter(t => t.projectId === p.id);
  const entries = state.entries.filter(e => tasks.some(t => t.id === e.taskId));
  const totalSec = entries.reduce((s,e) => s + entryDuration(e), 0);
  const plannedSec = (p.plannedHours || 0) * 3600;
  const pct = plannedSec > 0 ? Math.min(100, (totalSec / plannedSec) * 100) : 0;
  const revenue = p.billable && p.hourlyRate ? (totalSec / 3600) * p.hourlyRate : 0;
  const cat = state.categories.find(c => c.id === p.categoryId);

  let html = `<div class="detail-card">
    <div class="detail-header">
      <span class="detail-color" style="background:${p.color}"></span>
      <div class="detail-title-block">
        <div class="detail-title">${escapeHtml(p.name)}</div>
        <div class="detail-subtitle">${cat ? escapeHtml(cat.name) + ' · ' : ''}${p.startDate || '—'} bis ${p.dueDate || '—'}${p.billable ? ' · ' + (p.hourlyRate || 0) + ' €/h' : ' · nicht abrechenbar'}</div>
      </div>
      <div class="detail-actions">
        <button class="icon-btn" onclick="openProjectModal('${p.id}')" title="Bearbeiten"><i class="fa-solid fa-pen"></i></button>
        <button class="icon-btn" onclick="archiveProject('${p.id}')" title="Archivieren"><i class="fa-solid fa-box-archive"></i></button>
        <button class="icon-btn danger" onclick="deleteProject('${p.id}')" title="Löschen"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>

    <div class="metric-grid">
      <div class="metric"><div class="metric-label">Erfasst</div><div class="metric-value">${fmtHM(totalSec)}</div></div>
      <div class="metric"><div class="metric-label">Geplant</div><div class="metric-value">${plannedSec ? fmtHM(plannedSec) : '—'}</div></div>
      <div class="metric brand"><div class="metric-label">Fortschritt</div><div class="metric-value">${plannedSec ? Math.round(pct) + ' %' : '—'}</div></div>
      <div class="metric"><div class="metric-label">Umsatz</div><div class="metric-value">${revenue > 0 ? Math.round(revenue) + ' €' : '—'}</div></div>
    </div>

    ${plannedSec ? `<div class="progress-bar-wrap"><div class="bar" style="width:${pct}%"></div></div>` : ''}
  </div>

  <div class="detail-card">
    <div class="card-title">Letzte Zeiteinträge <span style="font-weight: 500; color: var(--muted); font-size: 12px;">${entries.length} gesamt</span></div>
    <div class="entries-list">`;

  const recent = [...entries].sort((a,b) => new Date(b.startTime) - new Date(a.startTime)).slice(0, 15);
  if (recent.length === 0) {
    html += `<div class="empty-state" style="padding: 30px 10px;"><i class="fa-regular fa-clock"></i><p>Noch keine Einträge in diesem Projekt.</p></div>`;
  } else {
    recent.forEach(e => {
      const task = state.tasks.find(t => t.id === e.taskId);
      const d = new Date(e.startTime);
      const dateStr = d.toLocaleDateString('de-DE', { day:'2-digit', month:'short' });
      html += `<div class="entry-row">
        <span class="entry-date">${dateStr}</span>
        <span class="entry-task">${task ? escapeHtml(task.name) : '—'}${e.note ? ' · ' + escapeHtml(e.note) : ''}</span>
        <span class="entry-duration">${fmtHM(entryDuration(e))}</span>
        <span class="entry-name">${escapeHtml(e.userName || '')}</span>
        <button class="icon-btn danger" onclick="deleteEntry('${e.id}')" title="Löschen"><i class="fa-solid fa-xmark"></i></button>
      </div>`;
    });
  }
  html += `</div></div>`;

  wrap.innerHTML = html;
}

// ===== Timer =====
function toggleTimer(taskId) {
  if (state.activeTimer && state.activeTimer.taskId === taskId) {
    stopTimer();
  } else {
    if (state.activeTimer && !state.settings.multiTimer) {
      stopTimer(false);
    }
    startTimer(taskId);
  }
}

function startTimer(taskId) {
  state.activeTimer = { taskId, startTime: new Date().toISOString() };
  saveLocal();
  updateRunningPill();
  renderProjects();
  toast('Timer gestartet', 'info');
}

function stopTimer(showToast=true) {
  if (!state.activeTimer) return;
  const startMs = new Date(state.activeTimer.startTime).getTime();
  const duration = Math.floor((Date.now() - startMs) / 1000);

  if (duration < 5) {
    // zu kurz – verwerfen
    state.activeTimer = null;
    saveLocal();
    updateRunningPill();
    renderProjects();
    if (showToast) toast('Timer verworfen (zu kurz)', 'info');
    return;
  }

  const taskId = state.activeTimer.taskId;
  const startTime = state.activeTimer.startTime;
  state.activeTimer = null;

  if (state.settings.stopNote) {
    promptEntryNote(taskId, startTime, duration);
  } else {
    addEntry(taskId, startTime, new Date().toISOString(), duration, '');
    if (showToast) toast('Eintrag gespeichert');
  }
  updateRunningPill();
  renderProjects();
}

function promptEntryNote(taskId, startTime, duration) {
  const task = state.tasks.find(t => t.id === taskId);
  modal.open(`Eintrag: ${task ? task.name : 'Aufgabe'}`, `
    <div class="form-row">
      <label class="modern-label">Dauer</label>
      <div style="font-size: 20px; font-weight: 700; color: var(--brand); font-variant-numeric: tabular-nums;">${fmtDur(duration)}</div>
    </div>
    <div class="form-row">
      <label class="modern-label">Notiz (optional)</label>
      <textarea class="modern-textarea" id="entryNote" placeholder="Was wurde gemacht?"></textarea>
    </div>
    <div class="form-row">
      <label class="modern-label">Abrechnungsstatus</label>
      <select class="modern-select" id="entryBilling">
        <option value="open">Offen</option>
        <option value="non_billable">Nicht abrechenbar</option>
        <option value="billed">Abgerechnet</option>
      </select>
    </div>
  `, `
    <button class="btn-secondary" onclick="modal.close()">Abbrechen</button>
    <button class="btn-primary" onclick="saveEntryFromModal('${taskId}','${startTime}',${duration})">Speichern</button>
  `);
}

function saveEntryFromModal(taskId, startTime, duration) {
  const note = document.getElementById('entryNote').value;
  const billing = document.getElementById('entryBilling').value;
  const endTime = new Date(new Date(startTime).getTime() + duration * 1000).toISOString();
  addEntry(taskId, startTime, endTime, duration, note, billing);
  modal.close();
  toast('Eintrag gespeichert');
}

function addEntry(taskId, startTime, endTime, duration, note, billing='open') {
  const e = {
    id: uid('e'),
    taskId,
    userName: state.profile.name || 'Anonym',
    startTime, endTime,
    durationSeconds: duration,
    note: note || '',
    billingStatus: billing
  };
  state.entries.push(e);
  saveLocal();
}

function deleteEntry(eid) {
  const idx = state.entries.findIndex(e => e.id === eid);
  if (idx === -1) return;
  const backup = state.entries[idx];
  state.entries.splice(idx, 1);
  saveLocal();
  renderProjectDetail();
  renderProjects();
  toast('Eintrag gelöscht', 'info', () => {
    state.entries.push(backup);
    saveLocal();
    renderProjectDetail();
    renderProjects();
  });
}

function updateRunningPill() {
  const pill = document.getElementById('runningTimerPill');
  if (!state.activeTimer) {
    pill.classList.remove('is-active');
    return;
  }
  const task = state.tasks.find(t => t.id === state.activeTimer.taskId);
  document.getElementById('runningTimerTask').textContent = task ? task.name : 'Aufgabe';
  pill.classList.add('is-active');
}

setInterval(() => {
  if (!state.activeTimer) return;
  const sec = Math.floor((Date.now() - new Date(state.activeTimer.startTime).getTime()) / 1000);
  document.getElementById('runningTimerDisplay').textContent = fmtDur(sec);
}, 1000);

document.getElementById('stopTimerBtn').onclick = () => stopTimer();

// ===== Projekt Modal =====
function openProjectModal(pid=null) {
  const p = pid ? state.projects.find(x => x.id === pid) : null;
  const cats = state.categories.map(c => `<option value="${c.id}" ${p && p.categoryId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
  const colors = PROJECT_COLORS.map(c => `<span class="color-swatch ${p && p.color === c || (!p && c === PROJECT_COLORS[0]) ? 'is-selected' : ''}" data-color="${c}" style="background:${c}"></span>`).join('');

  modal.open(p ? 'Projekt bearbeiten' : 'Neues Projekt', `
    <div class="form-row">
      <label class="modern-label">Projektname</label>
      <input type="text" class="modern-input" id="pmName" value="${p ? escapeHtml(p.name) : ''}" placeholder="z.B. Website Relaunch">
    </div>
    <div class="form-grid-2">
      <div class="form-row">
        <label class="modern-label">Kategorie</label>
        <select class="modern-select" id="pmCategory">
          <option value="">— ohne Kategorie —</option>
          ${cats}
        </select>
        <button type="button" class="btn-secondary" style="margin-top:8px; font-size: 12px; padding: 6px 12px;" onclick="quickAddCategory()">
          <i class="fa-solid fa-plus"></i> Kategorie anlegen
        </button>
      </div>
      <div class="form-row">
        <label class="modern-label">Farbe</label>
        <div class="color-picker" id="pmColors">${colors}</div>
      </div>
    </div>
    <div class="form-grid-2">
      <div class="form-row">
        <label class="modern-label">Startdatum</label>
        <input type="date" class="modern-input" id="pmStart" value="${p ? p.startDate || '' : ''}">
      </div>
      <div class="form-row">
        <label class="modern-label">Fälligkeitsdatum</label>
        <input type="date" class="modern-input" id="pmDue" value="${p ? p.dueDate || '' : ''}">
      </div>
    </div>
    <div class="form-grid-2">
      <div class="form-row">
        <label class="modern-label">Stundensatz (€)</label>
        <input type="number" class="modern-input" id="pmRate" value="${p ? p.hourlyRate || '' : ''}" placeholder="0">
      </div>
      <div class="form-row">
        <label class="modern-label">Geplante Stunden</label>
        <input type="number" class="modern-input" id="pmPlanned" value="${p ? p.plannedHours || '' : ''}" placeholder="0">
      </div>
    </div>
    <div class="form-grid-2">
      <div class="form-row">
        <label class="modern-label">Erfassungs-Modus</label>
        <select class="modern-select" id="pmMode">
          <option value="slot" ${!p || p.trackingMode === 'slot' ? 'selected' : ''}>Slot (Start/Ende pro Eintrag)</option>
          <option value="cluster" ${p && p.trackingMode === 'cluster' ? 'selected' : ''}>Cluster (1 Eintrag pro Tag)</option>
        </select>
      </div>
      <div class="form-row">
        <label class="modern-label">Abrechenbar</label>
        <label class="toggle" style="margin-top: 8px;">
          <input type="checkbox" id="pmBillable" ${p && p.billable ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>
    <div class="form-row">
      <label class="modern-label">Notizen</label>
      <textarea class="modern-textarea" id="pmNotes" placeholder="Optional">${p ? escapeHtml(p.notes || '') : ''}</textarea>
    </div>
  `, `
    <button class="btn-secondary" onclick="modal.close()">Abbrechen</button>
    <button class="btn-primary" onclick="saveProject('${pid || ''}')">${p ? 'Speichern' : 'Anlegen'}</button>
  `);

  // Color picker
  document.querySelectorAll('#pmColors .color-swatch').forEach(s => {
    s.onclick = () => {
      document.querySelectorAll('#pmColors .color-swatch').forEach(x => x.classList.remove('is-selected'));
      s.classList.add('is-selected');
    };
  });
}

function quickAddCategory() {
  const name = prompt('Name der neuen Kategorie:');
  if (!name) return;
  const c = { id: uid('c'), name, color: '#206efb' };
  state.categories.push(c);
  saveLocal();
  toast('Kategorie angelegt');
  openProjectModal();
  // Auswahl auf neue Kat setzen
  setTimeout(() => { document.getElementById('pmCategory').value = c.id; }, 50);
}

function saveProject(pid) {
  const name = document.getElementById('pmName').value.trim();
  if (!name) { toast('Bitte einen Namen eingeben', 'error'); return; }
  const data = {
    name,
    categoryId: document.getElementById('pmCategory').value || null,
    color: document.querySelector('#pmColors .color-swatch.is-selected').dataset.color,
    startDate: document.getElementById('pmStart').value,
    dueDate: document.getElementById('pmDue').value,
    hourlyRate: parseFloat(document.getElementById('pmRate').value) || 0,
    plannedHours: parseFloat(document.getElementById('pmPlanned').value) || 0,
    plannedBudget: 0,
    billable: document.getElementById('pmBillable').checked,
    trackingMode: document.getElementById('pmMode').value,
    notes: document.getElementById('pmNotes').value,
    archived: false
  };
  if (pid) {
    Object.assign(state.projects.find(p => p.id === pid), data);
    toast('Projekt aktualisiert');
  } else {
    const p = { id: uid('p'), ...data };
    state.projects.push(p);
    state.selectedProjectId = p.id;
    state.expandedProjects.add(p.id);
    toast('Projekt angelegt');
  }
  saveLocal();
  modal.close();
  renderProjects();
}

function archiveProject(pid) {
  const p = state.projects.find(x => x.id === pid);
  if (!p) return;
  p.archived = true;
  saveLocal();
  state.selectedProjectId = null;
  renderProjects();
  toast('Projekt archiviert', 'info', () => {
    p.archived = false; saveLocal(); renderProjects();
  });
}

function deleteProject(pid) {
  if (!confirm('Projekt und alle Aufgaben & Einträge wirklich löschen?')) return;
  const backup = {
    project: state.projects.find(x => x.id === pid),
    tasks: state.tasks.filter(t => t.projectId === pid),
    entries: state.entries.filter(e => state.tasks.some(t => t.projectId === pid && t.id === e.taskId))
  };
  state.tasks = state.tasks.filter(t => t.projectId !== pid);
  state.entries = state.entries.filter(e => !backup.tasks.some(t => t.id === e.taskId));
  state.projects = state.projects.filter(p => p.id !== pid);
  state.selectedProjectId = null;
  saveLocal();
  renderProjects();
  toast('Projekt gelöscht', 'info', () => {
    state.projects.push(backup.project);
    state.tasks.push(...backup.tasks);
    state.entries.push(...backup.entries);
    saveLocal();
    renderProjects();
  });
}

// ===== Task Modal =====
function openTaskModal(pid) {
  const typeOpts = Object.entries(TASK_TYPES).map(([k,v]) =>
    `<option value="${k}">${v.label}</option>`
  ).join('');
  modal.open('Neue Aufgabe', `
    <div class="form-row">
      <label class="modern-label">Aufgabenname</label>
      <input type="text" class="modern-input" id="tmName" placeholder="z.B. Konzept">
    </div>
    <div class="form-grid-2">
      <div class="form-row">
        <label class="modern-label">Typ</label>
        <select class="modern-select" id="tmType">${typeOpts}</select>
      </div>
      <div class="form-row">
        <label class="modern-label">Geplante Stunden</label>
        <input type="number" class="modern-input" id="tmPlanned" placeholder="0">
      </div>
    </div>
  `, `
    <button class="btn-secondary" onclick="modal.close()">Abbrechen</button>
    <button class="btn-primary" onclick="saveTask('${pid}')">Anlegen</button>
  `);
  setTimeout(() => document.getElementById('tmName').focus(), 100);
}

function saveTask(pid) {
  const name = document.getElementById('tmName').value.trim();
  if (!name) { toast('Bitte Aufgabenname eingeben', 'error'); return; }
  const t = {
    id: uid('t'),
    projectId: pid,
    parentTaskId: null,
    name,
    type: document.getElementById('tmType').value,
    plannedHours: parseFloat(document.getElementById('tmPlanned').value) || 0,
    completed: false,
    sortOrder: state.tasks.filter(x => x.projectId === pid).length
  };
  state.tasks.push(t);
  saveLocal();
  modal.close();
  toast('Aufgabe angelegt');
  renderProjects();
}

// ===== Heute =====
function renderToday() {
  const today = new Date();
  document.getElementById('todayDate').textContent =
    today.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const todays = state.entries.filter(e => isToday(e.startTime));
  const totalSec = todays.reduce((s,e) => s + entryDuration(e), 0);
  const targetSec = (state.profile.weeklyHours / 5) * 3600;
  const remainSec = Math.max(0, targetSec - totalSec);
  const pct = targetSec > 0 ? Math.min(100, (totalSec / targetSec) * 100) : 0;

  document.getElementById('todayTotalLabel').textContent = fmtHM(totalSec) + ' h';
  document.getElementById('todayBookedVal').textContent = fmtHM(totalSec);
  document.getElementById('todayTargetVal').textContent = fmtHM(targetSec);
  document.getElementById('todayRemainingVal').textContent = fmtHM(remainSec);
  document.getElementById('todayWorkloadPct').textContent = Math.round(pct) + ' %';
  document.getElementById('todayWorkloadFill').style.width = pct + '%';

  // Quick-Tasks: letzte 6 verwendete Aufgaben
  const recentTaskIds = [...new Set([...state.entries].sort((a,b) => new Date(b.startTime) - new Date(a.startTime)).map(e => e.taskId))].slice(0, 6);
  const qt = document.getElementById('quickTasks');
  if (recentTaskIds.length === 0) {
    qt.innerHTML = '<span style="font-size: 12px; color: var(--muted);">Noch keine Aufgaben verwendet.</span>';
  } else {
    qt.innerHTML = recentTaskIds.map(tid => {
      const t = state.tasks.find(x => x.id === tid);
      if (!t) return '';
      const p = state.projects.find(x => x.id === t.projectId);
      return `<span class="task-chip" onclick="toggleTimer('${tid}')">
        <span class="dot" style="background:${p ? p.color : '#94a3b8'}"></span>
        <i class="fa-solid fa-play" style="font-size:10px"></i>
        ${escapeHtml(t.name)}
      </span>`;
    }).join('');
  }

  // Heutige Einträge
  const list = document.getElementById('todayEntriesList');
  if (todays.length === 0) {
    list.innerHTML = `<div class="empty-state" style="padding: 30px 10px;"><i class="fa-regular fa-clock"></i><p>Noch keine Einträge heute.</p></div>`;
  } else {
    list.innerHTML = todays.sort((a,b) => new Date(b.startTime) - new Date(a.startTime)).map(e => {
      const t = state.tasks.find(x => x.id === e.taskId);
      const p = t ? state.projects.find(x => x.id === t.projectId) : null;
      const start = new Date(e.startTime).toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' });
      return `<div class="entry-row" style="grid-template-columns: 80px 1fr 80px 32px;">
        <span class="entry-date">${start}</span>
        <span class="entry-task"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p?p.color:'#94a3b8'};margin-right:6px;"></span>${t ? escapeHtml(t.name) : '—'}${e.note ? ' · ' + escapeHtml(e.note) : ''}</span>
        <span class="entry-duration">${fmtHM(entryDuration(e))}</span>
        <button class="icon-btn danger" onclick="deleteEntry('${e.id}')" title="Löschen"><i class="fa-solid fa-xmark"></i></button>
      </div>`;
    }).join('');
  }
}

document.getElementById('manualEntryBtn').onclick = () => openManualEntryModal();

function openManualEntryModal() {
  if (state.tasks.length === 0) {
    toast('Lege erst ein Projekt mit Aufgabe an', 'error');
    return;
  }
  const taskOpts = state.tasks.map(t => {
    const p = state.projects.find(x => x.id === t.projectId);
    return `<option value="${t.id}">${escapeHtml(p ? p.name : '')} · ${escapeHtml(t.name)}</option>`;
  }).join('');

  const today = todayISO();
  modal.open('Eintrag manuell erfassen', `
    <div class="form-row">
      <label class="modern-label">Aufgabe</label>
      <select class="modern-select" id="meTask">${taskOpts}</select>
    </div>
    <div class="form-row">
      <label class="modern-label">Datum</label>
      <input type="date" class="modern-input" id="meDate" value="${today}">
    </div>
    <div class="form-grid-2">
      <div class="form-row">
        <label class="modern-label">Von</label>
        <input type="time" class="modern-input" id="meStart" value="09:00">
      </div>
      <div class="form-row">
        <label class="modern-label">Bis</label>
        <input type="time" class="modern-input" id="meEnd" value="10:00">
      </div>
    </div>
    <div class="form-row">
      <label class="modern-label">Notiz (optional)</label>
      <textarea class="modern-textarea" id="meNote"></textarea>
    </div>
  `, `
    <button class="btn-secondary" onclick="modal.close()">Abbrechen</button>
    <button class="btn-primary" onclick="saveManualEntry()">Speichern</button>
  `);
}

function saveManualEntry() {
  const taskId = document.getElementById('meTask').value;
  const date = document.getElementById('meDate').value;
  const start = document.getElementById('meStart').value;
  const end = document.getElementById('meEnd').value;
  const note = document.getElementById('meNote').value;

  const startISO = new Date(`${date}T${start}:00`).toISOString();
  const endISO = new Date(`${date}T${end}:00`).toISOString();
  const dur = Math.floor((new Date(endISO) - new Date(startISO)) / 1000);
  if (dur <= 0) { toast('Endzeit muss nach Startzeit liegen', 'error'); return; }

  addEntry(taskId, startISO, endISO, dur, note);
  modal.close();
  toast('Eintrag gespeichert');
  renderToday();
  renderProjects();
}

// ===== Kalender =====
function renderCalendar() {
  const d = state.calCurrent;
  const year = d.getFullYear();
  const month = d.getMonth();
  document.getElementById('calPeriod').textContent =
    d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  // Mo = 0
  let firstDay = (first.getDay() + 6) % 7;
  const totalDays = last.getDate();
  const prevLast = new Date(year, month, 0).getDate();

  let html = '';

  // Vormonat
  for (let i = firstDay - 1; i >= 0; i--) {
    html += renderCalDay(new Date(year, month - 1, prevLast - i), true);
  }
  // Aktueller Monat
  for (let day = 1; day <= totalDays; day++) {
    html += renderCalDay(new Date(year, month, day), false);
  }
  // Nachmonat auffüllen
  const total = firstDay + totalDays;
  const rem = (7 - (total % 7)) % 7;
  for (let i = 1; i <= rem; i++) {
    html += renderCalDay(new Date(year, month + 1, i), true);
  }

  document.getElementById('calDays').innerHTML = html;
}

function renderCalDay(date, isOther) {
  const iso = date.toISOString().slice(0,10);
  const isTodayDay = iso === todayISO();
  const dayEntries = state.entries.filter(e => e.startTime.slice(0,10) === iso);
  const total = dayEntries.reduce((s,e) => s + entryDuration(e), 0);

  let html = `<div class="cal-day ${isOther ? 'is-other-month' : ''} ${isTodayDay ? 'is-today' : ''}" onclick="openManualEntryForDate('${iso}')">
    <span class="cal-day-num">${date.getDate()}</span>`;
  if (total > 0) html += `<span class="cal-day-total">${fmtHM(total)}</span>`;
  html += `<div class="cal-day-entries">`;
  dayEntries.slice(0, 3).forEach(e => {
    const t = state.tasks.find(x => x.id === e.taskId);
    const p = t ? state.projects.find(x => x.id === t.projectId) : null;
    html += `<span class="cal-entry-chip" style="background:${p ? p.color : '#94a3b8'}">${t ? escapeHtml(t.name) : '—'}</span>`;
  });
  if (dayEntries.length > 3) html += `<span style="font-size:10px;color:var(--muted)">+${dayEntries.length - 3} weitere</span>`;
  html += `</div></div>`;
  return html;
}

function openManualEntryForDate(iso) {
  openManualEntryModal();
  setTimeout(() => { document.getElementById('meDate').value = iso; }, 50);
}

document.getElementById('calPrev').onclick = () => { state.calCurrent.setMonth(state.calCurrent.getMonth() - 1); renderCalendar(); };
document.getElementById('calNext').onclick = () => { state.calCurrent.setMonth(state.calCurrent.getMonth() + 1); renderCalendar(); };
document.getElementById('calToday').onclick = () => { state.calCurrent = new Date(); renderCalendar(); };

// ===== Statistiken =====
let chartHoursInst = null, chartProjectsInst = null;

function renderStats() {
  const range = document.getElementById('statsRange').value;
  const [start, end] = getRange(range);
  const filtered = state.entries.filter(e => {
    const d = new Date(e.startTime);
    return d >= start && d <= end;
  });

  const totalSec = filtered.reduce((s,e) => s + entryDuration(e), 0);
  const days = Math.max(1, Math.ceil((end - start) / 86400000));
  const avgSec = totalSec / days;
  const activeProjects = new Set(filtered.map(e => {
    const t = state.tasks.find(x => x.id === e.taskId);
    return t ? t.projectId : null;
  }).filter(Boolean));
  const billableProj = [...activeProjects].filter(pid => {
    const p = state.projects.find(x => x.id === pid);
    return p && p.billable;
  }).length;

  let revenue = 0;
  filtered.forEach(e => {
    const t = state.tasks.find(x => x.id === e.taskId);
    if (!t) return;
    const p = state.projects.find(x => x.id === t.projectId);
    if (p && p.billable && p.hourlyRate) {
      revenue += (entryDuration(e) / 3600) * p.hourlyRate;
    }
  });

  document.getElementById('statTotal').textContent = fmtHM(totalSec);
  document.getElementById('statAvg').textContent = fmtHM(avgSec);
  document.getElementById('statProjects').textContent = activeProjects.size;
  document.getElementById('statBillable').textContent = billableProj;
  document.getElementById('statRevenue').textContent = Math.round(revenue).toLocaleString('de-DE');
  document.getElementById('statTotalTrend').textContent = days + ' Tage Zeitraum';

  // Chart: Hours per day
  const dayBuckets = {};
  filtered.forEach(e => {
    const d = e.startTime.slice(0,10);
    dayBuckets[d] = (dayBuckets[d] || 0) + entryDuration(e);
  });
  const labels = Object.keys(dayBuckets).sort();
  const data = labels.map(l => +(dayBuckets[l] / 3600).toFixed(2));

  if (chartHoursInst) chartHoursInst.destroy();
  chartHoursInst = new Chart(document.getElementById('chartHours'), {
    type: 'bar',
    data: {
      labels: labels.map(l => new Date(l).toLocaleDateString('de-DE', { day:'2-digit', month:'short' })),
      datasets: [{
        label: 'Stunden',
        data,
        backgroundColor: '#206efb',
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { grid: { color: '#e2e8f0' }, ticks: { color: '#475569' } },
        x: { grid: { display: false }, ticks: { color: '#475569' } }
      }
    }
  });

  // Chart: Projects donut
  const projSec = {};
  filtered.forEach(e => {
    const t = state.tasks.find(x => x.id === e.taskId);
    if (!t) return;
    const p = state.projects.find(x => x.id === t.projectId);
    if (!p) return;
    projSec[p.id] = (projSec[p.id] || 0) + entryDuration(e);
  });
  const pLabels = Object.keys(projSec).map(id => state.projects.find(p => p.id === id).name);
  const pData = Object.values(projSec).map(s => +(s/3600).toFixed(2));
  const pColors = Object.keys(projSec).map(id => state.projects.find(p => p.id === id).color);

  if (chartProjectsInst) chartProjectsInst.destroy();
  chartProjectsInst = new Chart(document.getElementById('chartProjects'), {
    type: 'doughnut',
    data: { labels: pLabels, datasets: [{ data: pData, backgroundColor: pColors, borderWidth: 0 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { color: '#475569', font: { size: 11 } } } }
    }
  });
}

function getRange(range) {
  const now = new Date();
  const end = new Date(now); end.setHours(23,59,59,999);
  let start = new Date(now);
  if (range === 'week') {
    const dayIdx = (now.getDay() + 6) % 7;
    start.setDate(now.getDate() - dayIdx);
  } else if (range === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (range === 'quarter') {
    const q = Math.floor(now.getMonth() / 3);
    start = new Date(now.getFullYear(), q * 3, 1);
  } else if (range === 'year') {
    start = new Date(now.getFullYear(), 0, 1);
  }
  start.setHours(0,0,0,0);
  return [start, end];
}

document.getElementById('statsRange').onchange = renderStats;

// ===== Team =====
function renderTeam() {
  const wrap = document.getElementById('teamGrid');
  if (state.members.length === 0) {
    wrap.innerHTML = `<div class="empty-state" style="grid-column: 1/-1;"><i class="fa-solid fa-users"></i><h4>Noch keine Teammitglieder</h4><p>Lege das erste Mitglied an.</p><button class="btn-primary" onclick="openMemberModal()"><i class="fa-solid fa-user-plus"></i> Mitglied hinzufügen</button></div>`;
    return;
  }
  wrap.innerHTML = state.members.map(m => {
    const memberEntries = state.entries.filter(e => e.userName === m.name);
    const weekStart = (() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); d.setHours(0,0,0,0); return d; })();
    const weekSec = memberEntries.filter(e => new Date(e.startTime) >= weekStart).reduce((s,e) => s + entryDuration(e), 0);
    const todaySec = memberEntries.filter(e => isToday(e.startTime)).reduce((s,e) => s + entryDuration(e), 0);
    const activeTask = state.activeTimer && state.profile.name === m.name
      ? state.tasks.find(t => t.id === state.activeTimer.taskId) : null;

    return `<div class="member-card">
      <div class="member-header">
        <div class="member-avatar">${initials(m.name)}</div>
        <div style="flex:1">
          <div class="member-name">${escapeHtml(m.name)}</div>
          <div class="member-role">${m.role === 'admin' ? 'Admin' : 'Mitglied'} · ${m.rate || 0} €/h</div>
        </div>
        <button class="icon-btn" onclick="openMemberModal('${m.id}')" title="Bearbeiten"><i class="fa-solid fa-pen"></i></button>
      </div>
      <div class="member-status ${activeTask ? '' : 'idle'}">
        <span class="pulse-dot"></span>
        ${activeTask ? 'Aktiv: ' + escapeHtml(activeTask.name) : 'Inaktiv'}
      </div>
      <div class="member-stats">
        <div>
          <div class="member-stat-label">Heute</div>
          <div class="member-stat-value">${fmtHM(todaySec)}</div>
        </div>
        <div>
          <div class="member-stat-label">Woche</div>
          <div class="member-stat-value">${fmtHM(weekSec)}</div>
        </div>
        <div>
          <div class="member-stat-label">Soll/W</div>
          <div class="member-stat-value">${m.weeklyHours || 40}h</div>
        </div>
      </div>
    </div>`;
  }).join('');
}

document.getElementById('addMemberBtn').onclick = () => openMemberModal();

function openMemberModal(mid=null) {
  const m = mid ? state.members.find(x => x.id === mid) : null;
  modal.open(m ? 'Mitglied bearbeiten' : 'Mitglied hinzufügen', `
    <div class="form-row">
      <label class="modern-label">Name</label>
      <input type="text" class="modern-input" id="mmName" value="${m ? escapeHtml(m.name) : ''}">
    </div>
    <div class="form-grid-2">
      <div class="form-row">
        <label class="modern-label">Rolle</label>
        <select class="modern-select" id="mmRole">
          <option value="member" ${m && m.role === 'member' ? 'selected' : ''}>Mitglied</option>
          <option value="admin" ${m && m.role === 'admin' ? 'selected' : ''}>Admin</option>
        </select>
      </div>
      <div class="form-row">
        <label class="modern-label">Stundensatz (€)</label>
        <input type="number" class="modern-input" id="mmRate" value="${m ? m.rate : 80}">
      </div>
    </div>
    <div class="form-row">
      <label class="modern-label">Wochenstunden</label>
      <input type="number" class="modern-input" id="mmHours" value="${m ? m.weeklyHours : 40}">
    </div>
  `, `
    ${m ? `<button class="btn-danger" style="margin-right: auto;" onclick="deleteMember('${mid}')"><i class="fa-solid fa-trash"></i> Löschen</button>` : ''}
    <button class="btn-secondary" onclick="modal.close()">Abbrechen</button>
    <button class="btn-primary" onclick="saveMember('${mid || ''}')">${m ? 'Speichern' : 'Anlegen'}</button>
  `);
}

function saveMember(mid) {
  const name = document.getElementById('mmName').value.trim();
  if (!name) { toast('Name eingeben', 'error'); return; }
  const data = {
    name,
    role: document.getElementById('mmRole').value,
    rate: parseFloat(document.getElementById('mmRate').value) || 0,
    weeklyHours: parseFloat(document.getElementById('mmHours').value) || 40
  };
  if (mid) {
    Object.assign(state.members.find(x => x.id === mid), data);
  } else {
    state.members.push({ id: uid('m'), ...data });
  }
  saveLocal();
  modal.close();
  toast('Gespeichert');
  renderTeam();
}

function deleteMember(mid) {
  state.members = state.members.filter(m => m.id !== mid);
  saveLocal();
  modal.close();
  renderTeam();
  toast('Mitglied gelöscht', 'info');
}

// ===== Einstellungen =====
function renderSettings() {
  document.getElementById('settingsName').value = state.profile.name || '';
  document.getElementById('settingsRole').value = state.profile.role || 'member';
  document.getElementById('settingsRate').value = state.profile.rate || 80;
  document.getElementById('settingsHours').value = state.profile.weeklyHours || 40;

  document.getElementById('remTimer').checked = state.settings.remTimer;
  document.getElementById('remEndDay').checked = state.settings.remEndDay;
  document.getElementById('remBudget').checked = state.settings.remBudget;
  document.getElementById('remBreak').checked = state.settings.remBreak;
  document.getElementById('setStopNote').checked = state.settings.stopNote;
  document.getElementById('setMultiTimer').checked = state.settings.multiTimer;
  document.getElementById('setAutoStop').checked = state.settings.autoStop;
}

document.getElementById('saveProfileBtn').onclick = () => {
  state.profile.name = document.getElementById('settingsName').value.trim();
  state.profile.role = document.getElementById('settingsRole').value;
  state.profile.rate = parseFloat(document.getElementById('settingsRate').value) || 80;
  state.profile.weeklyHours = parseFloat(document.getElementById('settingsHours').value) || 40;
  saveLocal();
  refreshUser();
  toast('Profil gespeichert');
};

['remTimer','remEndDay','remBudget','remBreak','setStopNote','setMultiTimer','setAutoStop'].forEach(id => {
  document.getElementById(id).onchange = (e) => {
    const key = id.startsWith('rem') ? id : id.replace('set','');
    const realKey = id === 'setStopNote' ? 'stopNote' :
                    id === 'setMultiTimer' ? 'multiTimer' :
                    id === 'setAutoStop' ? 'autoStop' : id;
    state.settings[realKey] = e.target.checked;
    saveLocal();
  };
});

document.getElementById('exportJsonBtn').onclick = () => {
  const data = JSON.stringify({
    profile: state.profile,
    categories: state.categories,
    projects: state.projects,
    tasks: state.tasks,
    entries: state.entries,
    members: state.members,
    settings: state.settings,
    exportedAt: new Date().toISOString()
  }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `roots-time-backup-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Export heruntergeladen');
};

document.getElementById('importJsonFile').onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!data.projects || !data.tasks) throw new Error('Ungültiges Format');
      state.profile = data.profile || state.profile;
      state.categories = data.categories || [];
      state.projects = data.projects || [];
      state.tasks = data.tasks || [];
      state.entries = data.entries || [];
      state.members = data.members || [];
      state.settings = { ...state.settings, ...(data.settings || {}) };
      saveLocal();
      renderProjects();
      refreshUser();
      toast('Import erfolgreich');
    } catch (err) {
      toast('Import fehlgeschlagen: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
};

document.getElementById('resetDataBtn').onclick = () => {
  if (!confirm('Wirklich ALLE Daten löschen und auf Demo-Stand zurücksetzen?')) return;
  localStorage.removeItem(STORAGE_KEY);
  state.activeTimer = null;
  state.selectedProjectId = null;
  state.expandedProjects.clear();
  seedDemo();
  saveLocal();
  refreshUser();
  renderProjects();
  toast('Daten zurückgesetzt');
};

document.getElementById('exportPdfBtn').onclick = () => {
  toast('PDF-Export wird in Phase 2 ergänzt (jsPDF Integration)', 'info');
};
document.getElementById('exportCsvBtn').onclick = () => {
  const rows = [['Datum','Projekt','Aufgabe','Person','Start','Ende','Dauer (h)','Notiz','Status']];
  state.entries.forEach(e => {
    const t = state.tasks.find(x => x.id === e.taskId);
    const p = t ? state.projects.find(x => x.id === t.projectId) : null;
    const dur = entryDuration(e);
    rows.push([
      e.startTime.slice(0,10),
      p ? p.name : '',
      t ? t.name : '',
      e.userName,
      new Date(e.startTime).toLocaleTimeString('de-DE'),
      e.endTime ? new Date(e.endTime).toLocaleTimeString('de-DE') : 'läuft',
      (dur/3600).toFixed(2).replace('.', ','),
      (e.note || '').replace(/[\r\n;]/g, ' '),
      e.billingStatus
    ]);
  });
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(';')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `roots-time-${todayISO()}.csv`; a.click();
  URL.revokeObjectURL(url);
  toast('CSV exportiert');
};

// ===== Header =====
document.getElementById('newProjectBtn').onclick = () => openProjectModal();
document.getElementById('globalSearch').oninput = (e) => {
  const q = e.target.value.toLowerCase();
  if (!q) return;
  // Einfache Suche: Projekt mit erstem Treffer auswählen
  const hit = state.projects.find(p => p.name.toLowerCase().includes(q));
  if (hit) {
    switchView('projects');
    state.selectedProjectId = hit.id;
    state.expandedProjects.add(hit.id);
    renderProjects();
  }
};

// ===== Helper =====
function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function refreshUser() {
  document.getElementById('currentUserName').textContent = state.profile.name || 'Nicht angemeldet';
  document.getElementById('currentUserRole').textContent =
    state.profile.name ? (state.profile.role === 'admin' ? 'Admin' : 'Mitglied') : 'Name in Einstellungen setzen';
  document.getElementById('currentUserAvatar').textContent = initials(state.profile.name);
}

// ===== Tastaturkürzel =====
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea, select')) return;
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    document.getElementById('globalSearch').focus();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
    e.preventDefault();
    openProjectModal();
  }
  if (e.key === 'Escape' && document.getElementById('modalOverlay').classList.contains('is-open')) {
    modal.close();
  }
});

// ===== Supabase Workspace-Sync =====
async function initApp() {
  if (USE_SUPABASE && supabase) {
    try {
      const remote = await loadFromSupabase();
      if (remote && typeof remote === "object" && (remote.projects || remote.entries)) {
        applyPayload(remote);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(getStatePayload()));
      } else {
        loadLocal();
        if (!state.projects || state.projects.length === 0) {
          if (!localStorage.getItem(STORAGE_KEY)) seedDemo();
        }
      }
    } catch (e) {
      console.warn("Supabase load:", e);
      loadLocal();
    }

    supabase
      .channel("roots_time_workspace_live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "roots_time_workspace" },
        (payload) => {
          const row = payload.new;
          if (!row || !row.payload) return;
          applyPayload(row.payload);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(getStatePayload()));
          refreshUser();
          renderProjects();
          const active = document.querySelector(".nav-item.is-active");
          const v = active ? active.dataset.view : "";
          if (v === "today") renderToday();
          if (v === "calendar") renderCalendar();
          if (v === "stats") renderStats();
          if (v === "team") renderTeam();
          if (v === "settings") renderSettings();
        }
      )
      .subscribe();
  } else {
    loadLocal();
  }

  refreshUser();
  renderProjects();
}

initApp();