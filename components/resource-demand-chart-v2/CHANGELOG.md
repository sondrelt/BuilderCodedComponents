# Changelog — resource-demand-chart-v2

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
