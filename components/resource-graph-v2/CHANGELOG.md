# Changelog

## 1.1.0 — 2026-06-19

- Replaced the native `<select>` work-type filter with a custom dropdown
  (button + popover list) styled to the palette — white, 12px radius, soft
  navy shadow, animated caret. Same behavior (Alle arbeidstyper + used types,
  re-render on pick); closes on outside click / Escape.
- Tooltip footer now summarizes `Behov: X · Dekket: egne+innleide`, since the
  stacked total isn't itself a meaningful number.
- Chart updates in place (`chart.update()`) instead of destroy/recreate on data
  change — no flicker, keeps transition animations. Still destroyed on unload.
- Trailing all-zero weeks are trimmed so the axis isn't padded with blanks when
  the view window overshoots the requirements.
- Stacking semantics unchanged (Utleide stays in the stack — total footprint).

## 1.0.0 — 2026-06-18

- First real version (replaces the empty scaffold).
- Weekly stacked-bar + behov-line chart, same visual as resource-graph v1.
- Numbers computed live from raw `projectRequirements` spans + `allocation`,
  mirroring the resource-req-v2 planner's aggregation (Egne from allocations;
  Udekt = max(0, behov−egne−innleide); Overskudd = max(0, −diff); Utleide
  excluded from the coverage diff). No longer depends on `perProjectData`.
- Week axis built from `viewFrom`/`viewTo` (same window as the planner).
- Work-type filter dropdown (only types present in active projects' requirements).
- Clickable legend toggles via Chart.js's built-in legend.
- Reacts to changes in projectRequirements, allocation, projects, workTypeEnum,
  viewFrom, viewTo. Destroys the chart instance on unload.
- External dependency: Chart.js via CDN (add as Script URL in Appfarm Create).
