"""Assemble app.js from _engine_head.js + trimmed _legacy_ui.js + _overrides.js."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent
legacy_path = ROOT / "_legacy_ui.js"
legacy = legacy_path.read_text(encoding="utf-8")

# Keep from "function addTime" onward, drop init/sync block at end
legacy = re.sub(r"^[\s\S]*?(?=^function addTime\(date, h, m=0\))", "", legacy, count=1, flags=re.MULTILINE)
legacy = re.sub(r"\n// ===== Supabase Workspace-Sync =====[\s\S]*", "\n", legacy, count=1)

legacy = legacy.replace(
    "function uid(prefix='id') { return prefix + '_' + Math.random().toString(36).slice(2,11); }",
    "function uid(prefix='id') { return crypto.randomUUID ? crypto.randomUUID() : (prefix + '_' + Math.random().toString(36).slice(2,11)); }",
)

head = (ROOT / "_engine_head.js").read_text(encoding="utf-8")
over = (ROOT / "_overrides.js").read_text(encoding="utf-8")

# Daten-Import/Reset: DB ist master
over += """

document.getElementById("importJsonFile").onchange = (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  toast("JSON-Import ist deaktiviert – Daten kommen aus der gemeinsamen Supabase-Datenbank.", "info");
};

document.getElementById("resetDataBtn").onclick = () => {
  toast("Es gibt keinen globalen Reset. Projekte oder Einträge einzeln löschen; Konto über Abmelden.", "info");
};
"""

out = head + "\n\n" + legacy + "\n\n" + over + "\nboot();\n"
(ROOT / "app.js").write_text(out, encoding="utf-8")
print("Wrote app.js, length", len(out))
