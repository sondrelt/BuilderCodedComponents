# Changelog — resource-demand-chart-v2

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
