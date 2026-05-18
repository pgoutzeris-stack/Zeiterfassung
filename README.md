# ROOTS TIME · Zeiterfassung

Statische Single-Page-App (GitHub Pages) mit **Supabase**-Persistenz im Projekt **ROOTS_Intranet_DB**.

## Live-Demo

Nach dem ersten Deploy: `https://pgoutzeris-stack.github.io/Zeiterfassung/`

## Supabase

- Tabelle `public.roots_time_workspace`: eine Zeile `id = default`, Spalte `payload` (JSON) mit allen App-Daten.
- Realtime auf dieser Tabelle für Tab-Sync.
- **Hinweis Sicherheit:** Für das MVP ist RLS auf dieser Tabelle deaktiviert (analog zum Team-Kalender-Setup). Jeder mit **Anon-Key** und **URL** kann schreiben. Für produktiven Mehrbenutzerbetrieb: Edge Function + Service Role oder Supabase Auth + RLS.

## Konfiguration

`config.js` enthält `SUPABASE_URL` und `SUPABASE_ANON_KEY` (öffentlicher Browser-Key).

## Lokal testen

```bash
cd Zeiterfassung
python3 -m http.server 8080
# http://localhost:8080
```

## GitHub Pages

Quellbranch `main`, Ordner `/` (Root).
