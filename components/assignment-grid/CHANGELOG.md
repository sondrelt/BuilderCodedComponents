# Changelog

## 1.1.0 — 2026-06-18

- Added `jobs` data source: Builder lease-out ads matched to resources by `workType`
- Job ghosts render in each matching resource's free gaps only (suppressed where they
  would overlap an existing allocation or absence)
- Ghost is a slim dashed indigo band — recessive vs. real bars, brightens on hover; a
  link (pointer cursor), not draggable. Multiple ads sharing one gap collapse into a
  single "N ledige oppdrag" marker
- Ghost shows the ad's `numberOfResources` as a count pill next to the title
- Clicking a ghost calls the `openJob` action with `jobId`
- Empty-lane "drag to assign" hint suppressed on rows that carry a ghost

## 1.0.0 — 2026-06-16

- Initial version
- Span-native timeline rendering (bars are positioned by date, not column index)
- Day / week granularity toggle, persisted via `viewGranularity` app variable
- Drag-to-create allocations by clicking an empty lane
- Move and resize existing allocations and absences by dragging
- Absence bars rendered as diagonal-stripe overlay bands above project bars
- Dynamic absence type colours via `absenceColors` data source
- Group-by-project view with PM / site manager role tags
- Summary rows: on project / available / total per column
- Now-line marker
- Search filter across name, work type, and position
- Out-of-viewport spans shown with edge chevrons (no silent truncation)
