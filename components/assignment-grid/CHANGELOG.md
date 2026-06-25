# Changelog

## 1.4.0 — 2026-06-25

- Editor popover redesigned closer to the reference "Allokering" dialog:
  - Header row with a title (Allokering / Fravær) and a trash **icon** for delete
    (replaces the bottom "Slett" button).
  - **Date From / Date To** fields replace the Fra/Til chips; clicking a field
    opens the day picker in a collapsible panel right below (no longer an
    always-visible inline calendar).
  - Project / absence-type picker is now a **flat list** with colored dots and a
    Søk filter, capped to ~5 visible rows then scrolls; the selected row gets a
    dashed-orange outline (`makeFlatList` replaces the dropdown `makeSearchSelect`).
    Projects now show their colour dot too (`getBadgeColor`).
  - Single orange **Lagre** button (Esc / outside-click still cancels).
- Popover is capped to the viewport height (scrolls internally) and re-clamps
  when switching kind, so opening a date picker then switching can't push it
  off-screen.
- Toggle behaviour: a **new** entry must pick Tildeling *eller* Fravær first (no
  kind preselected; the list shows a prompt and Lagre is blocked until chosen).
  Editing an existing record shows **only** the matching toggle button (the other
  kind is hidden, not just locked).

## 1.3.0 — 2026-06-25

- Merge of two parallel 1.2.0 lines: in-component editor popover + project colour marking.

- In-component allocation/absence editor popover (replaces the native
  `openAllocationAbsenceEditor` dialog). One popover with a Tildeling/Fravær toggle:
  - Tildeling → searchable project select (saved as `projectId`)
  - Fravær → searchable absence-type select with colour swatches (saved as `absenceType`)
  - Fra/Til exact-day calendar ported from resource-req-v2 (month nav + year quick-jump)
- Create (drag empty lane), edit (click a bar, prefilled), and Slett all run in-grid
- Optimistic UI: saving drops a real-looking bar in immediately (pending style), then
  the post-save rebuild swaps in the persisted record
- Persistence consolidated onto a single `allocationAbsenceSave` action (kind inferred
  from `projectId` vs `absenceType`); move/resize now save through it too. Delete uses
  `deleteAllocation` / `deleteAbsence`
- Rebuild guard added: an open popover survives datasource changes, then flushes on close
- Project colour marking in the group-by-project view: each project group header is
  now a muted tint of the project colour with a pinned left accent stripe, and a
  full-width line in the project colour sits directly under the title row, spanning
  the whole timeline. Replaces the previous heavy saturated header fill. Existing PM / site
  manager role stripes on the resource cells are preserved. New `--proj-color` +
  `.pl-group-sep`; `groupHeader(label, color)` (dropped the separate `fg` arg).

## 1.1.1 — 2026-06-19

- When "group by projects" is on, project groups now render in the `projects`
  data source order (previously resource-encounter order)

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
