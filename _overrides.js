// Overrides (ersetzt ältere Definitionen am Ende von app.js)

async function quickAddCategory() {
  const name = prompt("Name der neuen Kategorie:");
  if (!name || !name.trim()) return;
  const { data, error } = await supabase
    .from("categories")
    .insert({ workspace_id: WORKSPACE_ID, name: name.trim(), color: "#206efb" })
    .select()
    .single();
  if (error) {
    toast(error.message, "error");
    return;
  }
  state.categories.push(mapCategory(data));
  toast("Kategorie angelegt");
  openProjectModal();
  setTimeout(() => {
    const sel = document.getElementById("pmCategory");
    if (sel) sel.value = data.id;
  }, 50);
}

async function saveProject(pid) {
  const name = document.getElementById("pmName").value.trim();
  if (!name) {
    toast("Bitte einen Namen eingeben", "error");
    return;
  }
  const categoryId = document.getElementById("pmCategory").value || null;
  const color =
    document.querySelector("#pmColors .color-swatch.is-selected")?.dataset.color ||
    PROJECT_COLORS[0];
  const row = {
    workspace_id: WORKSPACE_ID,
    name,
    category_id: categoryId,
    color,
    start_date: document.getElementById("pmStart").value || null,
    due_date: document.getElementById("pmDue").value || null,
    hourly_rate: parseFloat(document.getElementById("pmRate").value) || 0,
    planned_hours: parseFloat(document.getElementById("pmPlanned").value) || 0,
    planned_budget: 0,
    billable: document.getElementById("pmBillable").checked,
    tracking_mode: document.getElementById("pmMode").value,
    notes: document.getElementById("pmNotes").value || "",
    archived: false,
    updated_at: new Date().toISOString(),
  };
  try {
    if (pid) {
      const { error } = await supabase.from("projects").update(row).eq("id", pid);
      if (error) throw error;
      toast("Projekt aktualisiert");
    } else {
      const { data: created, error } = await supabase.from("projects").insert(row).select().single();
      if (error) throw error;
      state.selectedProjectId = created.id;
      state.expandedProjects.add(created.id);
      toast("Projekt angelegt");
    }
    await loadWorkspaceData();
    modal.close();
    renderProjects();
  } catch (e) {
    toast(e.message || String(e), "error");
  }
}

async function archiveProject(pid) {
  try {
    const { error } = await supabase
      .from("projects")
      .update({ archived: true, updated_at: new Date().toISOString() })
      .eq("id", pid);
    if (error) throw error;
    state.selectedProjectId = null;
    await loadWorkspaceData();
    renderProjects();
    toast("Projekt archiviert", "info");
  } catch (e) {
    toast(e.message || String(e), "error");
  }
}

async function deleteProject(pid) {
  if (!confirm("Projekt und alle Aufgaben & Einträge wirklich löschen?")) return;
  try {
    const { error } = await supabase.from("projects").delete().eq("id", pid);
    if (error) throw error;
    state.selectedProjectId = null;
    await loadWorkspaceData();
    renderProjects();
    toast("Projekt gelöscht", "info");
  } catch (e) {
    toast(e.message || String(e), "error");
  }
}

async function saveTask(pid) {
  const name = document.getElementById("tmName").value.trim();
  if (!name) {
    toast("Bitte Aufgabenname eingeben", "error");
    return;
  }
  const sortOrder = state.tasks.filter((x) => x.projectId === pid).length;
  const row = {
    project_id: pid,
    parent_task_id: null,
    name,
    type: document.getElementById("tmType").value,
    planned_hours: parseFloat(document.getElementById("tmPlanned").value) || 0,
    completed: false,
    sort_order: sortOrder,
  };
  try {
    const { error } = await supabase.from("tasks").insert(row);
    if (error) throw error;
    await loadWorkspaceData();
    modal.close();
    toast("Aufgabe angelegt");
    renderProjects();
  } catch (e) {
    toast(e.message || String(e), "error");
  }
}

async function addEntry(taskId, startTime, endTime, duration, note, billing = "open") {
  const id = crypto.randomUUID();
  const row = {
    id,
    task_id: taskId,
    user_id: sessionUser.id,
    user_display_name:
      state.profile.name || sessionUser.email?.split("@")[0] || "User",
    start_time: startTime,
    end_time: endTime,
    duration_seconds: duration,
    note: note || "",
    billing_status: billing,
  };
  try {
    const { data, error } = await supabase.from("time_entries").insert(row).select().single();
    if (error) throw error;
    state.entries.push(mapEntry(data));
    saveLocal();
  } catch (e) {
    toast(e.message || String(e), "error");
  }
}

async function deleteEntry(eid) {
  try {
    const { error } = await supabase.from("time_entries").delete().eq("id", eid);
    if (error) throw error;
    state.entries = state.entries.filter((e) => e.id !== eid);
    saveLocal();
    renderProjectDetail();
    renderProjects();
    toast("Eintrag gelöscht", "info");
  } catch (e) {
    toast(e.message || String(e), "error");
  }
}

async function saveManualEntry() {
  const taskId = document.getElementById("meTask").value;
  const date = document.getElementById("meDate").value;
  const start = document.getElementById("meStart").value;
  const end = document.getElementById("meEnd").value;
  const note = document.getElementById("meNote").value;
  const startISO = new Date(`${date}T${start}:00`).toISOString();
  const endISO = new Date(`${date}T${end}:00`).toISOString();
  const dur = Math.floor((new Date(endISO) - new Date(startISO)) / 1000);
  if (dur <= 0) {
    toast("Endzeit muss nach Startzeit liegen", "error");
    return;
  }
  await addEntry(taskId, startISO, endISO, dur, note);
  modal.close();
  toast("Eintrag gespeichert");
  renderToday();
  renderProjects();
}

function refreshUser() {
  const display =
    state.profile.name ||
    sessionUser?.user_metadata?.full_name ||
    sessionUser?.email?.split("@")[0] ||
    "…";
  document.getElementById("currentUserName").textContent = display;
  document.getElementById("currentUserRole").textContent = state.profile.name
    ? state.profile.role === "admin"
      ? "Admin"
      : "Mitglied"
    : "Profil vervollständigen";
  document.getElementById("currentUserAvatar").textContent = initials(display);
}

function openMemberModal(mid = null) {
  if (mid) {
    toast("Profil-Änderungen anderer Nutzer sind derzeit nicht vorgesehen.", "info");
    return;
  }
  toast(
    "Neue Kolleg:innen melden sich mit @" +
      ALLOWED_EMAIL_DOMAIN +
      " an – sie erscheinen automatisch im Team.",
    "info"
  );
}

async function saveMember(mid) {
  toast("Teamprofile kommen aus den Benutzerkonten (Supabase Auth).", "info");
  modal.close();
}

async function deleteMember(mid) {
  toast("Nutzerkonten bitte im Supabase-Dashboard verwalten.", "info");
  modal.close();
}
