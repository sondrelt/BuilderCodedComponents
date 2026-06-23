# Changelog

## 1.3.0 — 2026-06-23

- Migrated chart rendering from Chart.js to **ApexCharts** (same `cdn.jsdelivr.net`
  domain, so no new CSP whitelist). All data aggregation, the week axis, and the
  custom work-type dropdown are unchanged.
- **Behov renders as solid black circles** in the graph (strokeWidth 0 removes
  ApexCharts' default white ring), and its **legend marker is a matching circle**
  (the five bar series stay as squares), via per-series `legend.markers.shape`.
  Chart.js's built-in legend couldn't size/shape one marker independently — the
  reason for the move.
- The work-type filter is overlaid top-right, **inline with the legend row**.
- Behov is the **leftmost legend item** via `legend.inverseOrder` (the line stays
  last in the series array so column stacking and the on-top line render
  correctly; the other five legend items appear reversed as a result).
- Source colours use resource-req-v2's work-type bar fills (`--rp-*-bar`) — the
  exact colours of the planner's resource-need spans — rendered at full strength
  (`fill.opacity: 1`, overriding ApexCharts' 0.85 default) so the chart bars match
  the planner spans (Behov stays near-black as the reference line).
- Legend click toggles series visibility (`onItemClick.toggleDataSeries`).
- In-place updates via `chart.updateOptions()` instead of destroy/recreate.
- Tooltip footer (`Behov: X · Dekket: egne+innleide`) reimplemented as a custom
  dark tooltip; per-series rows still skip zero values. Same palette, stacked
  semantics, and trailing-empty-week trim.
- **Action required when syncing:** change the Resources Script URL in Appfarm
  Create from `chart.js` to `https://cdn.jsdelivr.net/npm/apexcharts`. The HTML
  tab now mounts a `<div id="resourceChart">` instead of a `<canvas>`.

## 1.2.0 — 2026-06-19

- Egne ansatte now nets out absence. Was: count of overlapping allocation
  rows. Now: count of **distinct allocated persons present** per week — i.e.
  distinct `allocation.resource` minus any `resource` absent that week.
- New `absence` data source (`resource`, `dateFrom`, `dateTo`); person-global
  (no project/workType), so an absence removes that person from Egne for every
  allocation that week. Added to the change-listener set.
- Counting persons (not allocation rows) is the behavioral change that makes
  absence-matching meaningful — two allocations for the same person in a week
  now count once.
- Requires the `allocation` and `absence` data sources to be connected to this
  component (binding names exactly `allocation` / `absence`).

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
