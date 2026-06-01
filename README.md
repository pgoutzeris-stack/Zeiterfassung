# ROOTS TIME · Zeiterfassung

Interne Zeiterfassung für **ROOTS Consultants** mit **Supabase Auth** (nur `@roots-consultants.com`) und **Echtzeit-Sync** (Postgres + Realtime).

**GitHub Pages:** https://pgoutzeris-stack.github.io/Zeiterfassung/

## Anmeldung

- **Registrierung** nur mit Firmen-Mail und Passwort (min. 8 Zeichen).
- Wenn im Supabase-Projekt **E-Mail-Bestätigung** aktiv ist: Link im Postfach anklicken, danach anmelden.  
  (Dashboard → Authentication → Providers → Email → „Confirm email” optional deaktivieren für interne Tests.)

## Technik

- `index.html` – UI
- `config.js` – öffentlicher Supabase-Anon-Key + URL
- `app.js` – zusammengebaut aus `_engine_head.js`, gekürztem `_legacy_ui.js` und `_overrides.js` (`python3 build_app_js.py`)

### Datenbank (ROOTS_Intranet_DB)

Tabellen: `profiles`, `categories`, `projects`, `tasks`, `time_entries` – alle mit **RLS** (außer ältere Kalender-Tabellen).

Neue Nutzer: Trigger `handle_new_user` prüft Domain und legt `profiles` an.

### Sicherheit

- Ohne gültige Session liefert Postgres keine Zeilen (RLS).
- Die alte JSON-Tabelle `roots_time_workspace` wird nicht mehr genutzt.

## Entwicklung

```bash
cd Zeiterfassung
python3 build_app_js.py   # app.js neu erzeugen
python3 -m http.server 8080
```
