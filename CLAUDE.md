# GPX Rebuilder

A client-side web app that reconstructs a timestamped GPX (and later TCX) activity file from a planned route plus manually recorded splits, for uploading to Strava when the watch/phone GPS failed during a run.

Typical flow: user drops a route GPX, pastes splits like `1k 6:10 / 2k 12:19 / 5.37k 31:31`, sets the finish time, previews, downloads, uploads to Strava.

---

## Hard constraints

- **Client-only.** No backend, no server functions, no database, no analytics, no accounts. All processing happens in the browser. Route files never leave the device.
- **Static site hosted on GitHub Pages** under a sub-path, deployed by the GitHub Actions workflow in `.github/workflows/deploy.yml` when the user pushes to `main`. Claude Code writes the workflow file but never triggers a deploy.
- **No version control or GitHub operations.** Never run `git commit`, `git push`, `git remote`, `git branch`, `git tag` or any other command that changes repository state. Never use the `gh` CLI or the GitHub API, and never create or modify repositories or their settings. Writing files under `.github/` locally is fine. Read-only commands like `git status` and `git diff` are fine. The user handles all of this themselves.
- **Installable PWA** that works fully offline after first load (map tiles excepted).
- **Desktop-first UI.** Primary use is in a desktop browser. It must also be decent on a phone (Android, installed as a PWA): fully usable, just less spacious.
- The algorithm lives in `src/core/` as **pure TypeScript functions with no React, DOM, or browser-API imports** (the GPX parser/serializer may take/return strings). This is non-negotiable: it keeps the core testable in Node.

---

## Stack

| Concern | Choice |
|---|---|
| Build | Vite |
| UI | React 18+ with TypeScript (`strict: true`, no `any`) |
| Styling | Tailwind CSS |
| Map | Leaflet + react-leaflet, OSM raster tiles with required attribution |
| XML | Browser `DOMParser` in the UI layer; core parser must accept an injected parser or work on a minimal string-based approach so tests run in Node (use `@xmldom/xmldom` as a dev dependency for tests if needed) |
| Geometry | Hand-written haversine + linear interpolation in `src/core/geo.ts`. No turf. |
| Lint/format | ESLint + Prettier |
| PWA | `vite-plugin-pwa` |
| Deploy | GitHub Actions workflow file, `actions/deploy-pages` |

Do not add dependencies beyond these without asking.

---

## Project layout

```
src/
  core/                 # pure logic, no React/DOM
    types.ts
    geo.ts              # haversine, cumulative distance, point-at-distance
    parseRoute.ts       # GPX string -> RoutePoint[]
    parseSplits.ts      # free text -> Split[]
    rebuild.ts          # route + splits + anchor -> TimedPoint[]
    serializeGpx.ts     # TimedPoint[] -> GPX string
    serializeTcx.ts     # (phase 5)
    verify.ts           # re-derive splits from output for the check table
  ui/
    components/
    hooks/
  App.tsx
  main.tsx
tests/
  fixtures/
    5.37k.gpx           # real route, see "Reference fixture"
  core/*.test.ts
public/
  icons/
.github/workflows/deploy.yml
```

---

## Algorithm 

This example was used by another claude agent that was doing it inside chat, if there are improvements or optimizations implement them.

1. **Parse route.** Accept `<trkpt>` (all `<trkseg>`s concatenated in order) and `<rtept>`. `ele` optional. Ignore any existing `<time>`.
2. **Deduplicate** consecutive points closer than 0.05 m.
3. **Cumulative distance** along the polyline with haversine, R = 6371008.8 m.
4. **Resolve distance mismatch** between route length `L` and last split distance `D`:
   - `scale` (default): multiply every split distance by `L / D`. Output distance equals route length.
   - `trim`: only valid if `D <= L`; cut the route at distance `D` (interpolating the final point). If `D > L`, return an error suggesting `scale`.
   - Add a warning if `|L / D - 1| > 0.02`.
5. **Piecewise-linear time model.** Prepend `(0 m, 0 s)` to the splits. Pace is constant within each split interval. Provide:
   - `distanceAt(t)`: elapsed seconds -> distance
   - `timeAt(d)`: distance -> elapsed seconds
6. **Generate points from two sources and merge by time:**
   - **Every route vertex**, timestamped with `timeAt(cumDist)` at millisecond precision. **This is critical.** Sampling only on a fixed time grid cuts corners on bends; on the reference run that lost ~18 m and made every split ~3 s slow.
   - **Uniform samples** every `sampleIntervalS` (default 1 s) from 0 to total elapsed, positioned with `pointAt(distanceAt(t))`. Dense samples keep Strava's auto-pause from triggering and make the pace graph smooth.
   - Merge, sort by time, and drop a sample if another point already has the same millisecond timestamp.
7. **Elevation** is linearly interpolated along the segment. If the route has no elevation, omit `<ele>`.
8. **Absolute time.** `startMs = anchor.kind === 'start' ? anchor.epochMs : anchor.epochMs - totalElapsedS * 1000`. All output timestamps are UTC.


### Verification

Re-parse the generated GPX string (not the in-memory points) and compute, for each input split distance, the elapsed time at which the output track reaches it (interpolate within the crossing segment). Also report total distance, start and end time. The UI shows this next to the user's input with the delta. Every split must be within ±1 s of input.

---

## Split input

**Either** a well adjusted ui, that can be customizable for different splits and be comfortable to use.

**Or** one textarea. Accept messy human input. Entries are separated by newlines, commas, semicolons, or ` / `.

**Distance tokens** (case-insensitive):
- `1k`, `1km`, `5.37k` -> kilometres
- `400m`, `800` (bare number) -> metres
- `1mi`, `0.5mi` -> miles (1609.344 m)

**Time tokens:** `ss`, `m:ss`, `mm:ss`, `h:mm:ss`, each optionally with fractional seconds (`6:09.8`).

**Modes** (segmented control in the UI, with auto-guess):
- **Cumulative** (default): each entry is `distance time`, both cumulative. Example: `1k 6:10, 2k 12:19, 3k 18:13, 4k 24:21, 5.37k 31:31`.
- **Laps**: each entry is `distance time` for that lap only, or just `time` when a uniform lap distance is set in a separate field (e.g. lap = `1k`, input `6:10 6:09 5:54 6:08 7:10`). A final partial lap needs an explicit distance (`1.37k 7:10`). Convert to cumulative internally.
- **Auto-guess:** if every entry has a distance and distances are increasing, and times are increasing, assume cumulative; if times are all similar in magnitude and distances equal, suggest laps. The user can always override.

**Validation errors** (inline, per line, with line number): unparseable token, non-increasing distance or time, zero-length split, fewer than one split.

Parser must be covered by table-driven tests including every example above.

---

## Anchor time

- Toggle: **Start time** / **Finish time**. Default **finish**, prefilled with the current time rounded down to the minute.
- `<input type="datetime-local">` interpreted in the browser's time zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`), shown as a label next to the field.
- Display the derived other end ("Start: 18:18:29") live.

---

## GPX output (`serializeGpx.ts`)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="GPX Rebuilder" version="1.1" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
 <metadata><time>{start}</time></metadata>
 <trk>
  <name>{activity name}</name>
  <type>running</type>
  <trkseg>
   <trkpt lat="{7 dp}" lon="{7 dp}"><ele>{1 dp}</ele><time>{iso}</time></trkpt>
  </trkseg>
 </trk>
</gpx>
```

- Default activity name from local start hour: 05–11 Morning, 12–16 Afternoon, 17–20 Evening, else Night, + " Run". Editable in the UI.
- Default filename: `run_YYYY-MM-DD_HHmm.gpx` (local time).
- Escape XML in the name.

---

## UI

Single screen, designed for desktop first.

- **Desktop (≥ 1024 px):** two columns, inputs on the left (fixed width, ~400–480 px) and preview on the right (map on top taking most of the height, verification table below). Everything important is visible without scrolling on a 1080p screen. Dropping a GPX anywhere on the window loads it.
- **Tablet (768–1023 px):** same two columns, narrower, map shorter.
- **Mobile (< 768 px):** single column of stacked cards in the order below, map at a comfortable fixed height, touch targets ≥ 44 px, no horizontal scrolling, inputs use appropriate mobile keyboards (`inputmode`).

1. **Route**: drop zone + file button. `accept=".gpx,application/gpx+xml,application/octet-stream,text/xml"` (Android often reports GPX as octet-stream). After loading show route length and point count.
2. **Splits**: textarea, mode control, lap distance field (laps mode only), inline errors.
3. **Time**: start/finish toggle, datetime-local, derived other end.
4. **Options** (collapsed by default): mismatch mode, sample interval, activity name.
5. **Summary**: stated vs route distance (with mismatch warning), total time, average pace.
6. **Map preview**: route polyline colored per split by pace (faster = cooler colour), start/finish markers, fit bounds.
7. **Verification table**: split | your time | file time | delta. Deltas > 1 s highlighted red.
8. **Download** button (primary). On desktop, always visible at the bottom of the inputs column; on mobile, sticky at the bottom of the screen.

Recompute on every input change (debounce ~150 ms). Remember the last used split mode, anchor kind, lap distance and options in `localStorage`, wrapped in try/catch. Never persist route data.

Accessible: labels on every input, keyboard-usable, respects dark mode via `prefers-color-scheme`.


## Reference fixture

`tests/fixtures/5.37k.gpx` is a real Strava route export (Kyiv, ~5.37 km, 159 points, no timestamps). The user will place it there.

Golden test for `rebuild` + `verify` with these inputs:

- Splits (cumulative): `1k 6:10, 2k 12:19, 3k 18:13, 4k 24:21, 5.37k 31:31`
- Anchor: finish at `2026-09-30T18:50:00+03:00`
- Mismatch: `scale`, sample interval 1 s

Expected:

| Check | Value |
|---|---|
| Points after dedupe | 159 |
| Route length | 5372.9 m ± 1 m |
| Output total distance | 5372.9 m ± 1 m |
| First timestamp | `2026-09-30T15:18:29Z` |
| Last timestamp | `2026-09-30T15:50:00Z` |
| Time at 1/2/3/4 km | within ±1 s of 6:10 / 12:19 / 18:13 / 24:21 |
| Output point count | ~2049 (assert between 2000 and 2100) |

Also add a regression test proving that uniform-only sampling (no vertices) is shorter than the route by more than 10 m, to lock in why vertices are kept.

---

## Build phases

Work phase by phase. Finish each phase's acceptance criteria, run tests, and stop for review before starting the next.

1. **Core.** Scaffold Vite + React + TS + Tailwind + Vitest + ESLint/Prettier. Implement `src/core/*` (except TCX) with full tests including the golden fixture. No UI yet beyond the Vite default.
   *Done when:* `npm test` passes, golden test passes.
2. **Minimal UI.** Route drop, splits textarea with modes, anchor, download, summary. No map.
   *Done when:* the reference run can be reproduced end to end in the browser and the downloaded file matches the golden values.
3. **Preview.** Leaflet map with per-split pace colouring, verification table, options panel, localStorage settings.
4. **PWA + deploy workflow.** Manifest, icons, offline support, share target, base path, `.github/workflows/deploy.yml`.
   *Done when:* `npm run build && npm run preview` serves the app correctly under the base path, Chrome reports it as installable, and it keeps working with the network disabled in DevTools. The user will test the Android install and share target after hosting it.
5. **Extras.**
   - **TCX export** with one `<Lap>` per split (Strava reads laps from TCX but ignores them in GPX). Format toggle GPX/TCX.
   - **Track mode**: generate an oval route for a 250 m or 400 m track (user picks length and lap count, and places the track by clicking the map or entering coordinates) instead of uploading a route.
   - **Rest intervals**: `rest 1:30` entries in the splits input. Position holds, time advances.
6. **(Optional, needs discussion)** Direct Strava upload. Requires OAuth token exchange that cannot run on Pages; would need a tiny serverless function. Do not start without explicit approval.
