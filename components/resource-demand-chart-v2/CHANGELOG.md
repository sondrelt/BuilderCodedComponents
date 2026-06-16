# Changelog — resource-demand-chart-v2

## 1.3.3 — 2026-06-16

- Softened the sum-marker line/ticks: currentColor (dark category text) was too
  harsh; now a translucent black (--sum-line: rgba(0,0,0,0.22)) that reads as a
  slightly darker shade of the band tint. The number stays dark for readability.

## 1.3.2 — 2026-06-16

Sum markers now show run boundaries:
- The underline uses currentColor (the category text colour) instead of the pale
  --sum-color, so it's legible on the faint band.
- Short 6px vertical end ticks (::before/::after) cap each run's start and stop,
  so it's clear where each sum value begins and ends; gaps stay blank.
- Dropped the now-unused --sum-color custom property (--sum-tint kept for the band).

## 1.3.1 — 2026-06-16

Rebalanced prominence (the editable worktype bars are what users interact with,
so the sums should recede):
- Sum (source-header) rows now render the value as an underlined-number marker
  — no fill/box/shadow/bold, a 2px category-coloured underline spanning each run
  on a faint band — instead of the heavier "total" bars from 1.3.0. Worktype
  rows (editable + derived) stay the prominent solid bars.
- Alternate-span shade changed from a muddy darken (brightness 0.92) to vivid +
  slightly lighter (saturate 1.5, brightness 1.05); applied to worktype spans
  only — sum markers no longer alternate.
- Per-source band tint and underline colour now driven by --sum-tint/--sum-color
  custom properties (CSS-only change; index.js untouched).

## 1.3.0 — 2026-06-16

Readability of the bar rows:
- Sum-of-worktypes (source-header) rows now show a light category-tinted
  background band and heavier bars (bold number, stronger border, slight
  shadow) so the total is distinct from the worktype breakdown rows, which
  stay on white. Adds the rp-row-source-header-<source> row class.
- Every other span within a row is shaded slightly darker (rp-bar-alt,
  filter: brightness(0.92)) so adjacent runs like 6|8|6 are easy to tell
  apart. Applied to both aggregate and editable bars.

## 1.2.0 — 2026-06-16

Aggregate rows as bars:
- Source-header rows (Behov/Egne/Innleide/Utleide/Udekt/Overskudd) and derived
  work-type rows (Egne/Udekt/Overskudd) now render as bars instead of a number-
  per-column strip. Adjacent columns with the same value collapse into one
  read-only bar with the value shown once; zero columns are gaps.
- New makeRunBarTrack helper does the run-collapse; makeSummaryTrack and
  makeDerivedTrack route through it. Aggregate bars are pointer-events:none
  (not draggable); only the "Se detaljer" popover button stays interactive,
  now pinned to the track's right edge.
- Removed the per-column summary/derived cell rendering and its dead CSS
  (.rp-summary-cell*, .rp-derived-cell*, .rp-track-summary, .rp-track-derived).

## 1.1.1 — 2026-06-16

Bug fixes:
- buildColumns: normalize the week cursor to startOfDay so each column's start
  is midnight instead of 23:59:59.999. The old end-of-day starts opened a ~24h
  dead zone per week where colIndexForDate found no column and bars snapped to
  the right edge (gridWidth).
- Removed a leftover debug console.log from makeBar.
- Bar resize handles pinned absolutely to the bar edges; count centred as an
  absolute overlay so it stays centred at any bar width.
- Renamed quantity/qty fields and action params to resourceCount/count to match
  the Appfarm data source and action interface.

## 1.1.0 — 2026-06-16

Bug fixes:
- Fix drag jump on mousedown: replaced Math.round pixel delta with column-index
  difference so deltaWeeks is always 0 at drag start
- Fix stale trackRect when a data update arrives during drag start: capture
  trackRect and bar ref before removePopover() can trigger a DOM rebuild

Action interface:
- updateProjectRequirement and deleteProjectRequirement now use
  projectRequirementId (was requirementId)
- updateProjectRequirement no longer passes projectId, source, workType —
  these never change after create; requirementId alone identifies the record
- deleteProjectRequirement no longer passes projectId, source, workType

Cleanup (ponytail review):
- Removed redundant BAR_SOURCES constant (same members as EDITABLE_SOURCES)
- Replaced MONTHS_NB array with Intl toLocaleString('nb-NO', {month:'short'})
- Removed dead column.index field (was set but never read)
- Removed redundant dataset.ready guard in ensureSkeleton (initialized flag
  in init() already prevents double-init)
- JSDoc cast added to querySelector('.rp-popover-input') → HTMLInputElement

## 1.0.0 — 2026-06-16
Initial release. Complete rewrite replacing the Chart.js bar+line chart with an
interactive Gantt-style requirements planner.

Key features:
- Drag to create requirement bars (Behov, Innleide, Utleide) per work type
- Resize and move bars with week-snapping
- Quantity popover on confirm and click-to-edit; "Slett periode" delete button
- Optimistic UI: ghost bar promoted immediately on confirm; data source rebuild
  swaps in the persisted bar
- Egne (own employees) derived from allocation records; Udekt and Overskudd
  computed per column as max(0, Behov − Egne − Innleide) and its inverse
- Guarded rebuilds: queued while popover is open or drag is in progress, then
  flushed when the interaction ends
- Collapse/expand per project; colour-coded project group headers
- Now-line indicator highlighting the current week column
- Records with invalid dates skipped with a console warning instead of silently
  blocking the row
- No client-side overlap check — createProjectRequirement handles split/merge
  server-side
