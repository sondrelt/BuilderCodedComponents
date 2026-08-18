# Changelog

## 1.1.0 — 2026-08-18

Phone + desktop support. Desktop mouse behavior is unchanged; touch gets its
own tap-based interaction path instead of a reimplemented drag.

- **Touch taps open a popover instead of dragging.** The drag-to-create/move/
  resize lifecycle (`onPointerDown`/`onPointerMove`/`onPointerUp`) is wired to
  raw `mousedown`/`mousemove`/`mouseup` and stays that way — untouched. A new,
  independent `pointerdown` listener (`onTouchPointerDown`, gated to
  `e.pointerType === 'touch'`) tracks a tap without calling `preventDefault()`
  or capturing the pointer, so native scroll is never disturbed. `pointerup`
  with no meaningful movement (`pointercancel`, or `>10px` of drift, means the
  browser took it as a scroll) opens the same create/edit popover the mouse's
  "click without dragging" path uses. Dragging a bar's edge on a 75px-wide day
  column isn't precise enough to be usable on touch anyway, and any drag there
  competes with the scroll needed to reach other weeks — tap-then-adjust-via-
  the-popover's-date-fields is the more reliable interaction, not just the
  smaller diff. Extracted `openCreatePopover`/`openEditPopover` out of
  `onPointerUp` so both input paths share one implementation.
- **Responsive sticky column.** `STICKY_W` (was a hardcoded `380`) is now
  `getStickyW()`, returning `140` under a 640px container-width breakpoint —
  on a phone viewport the fixed 380px column left 0-1 timeline columns
  visible. CSS mirrors the same breakpoint: the resource column narrows to
  name-only (`.resource-position` hidden), and `.ptg-controls` wraps instead
  of overflowing. A debounced `ResizeObserver` on `#team-planner` reruns
  `guardedBuildAll` so rotating the phone re-lays-out the grid.
- **Popover width and absence-bar touch target.** `.ptg-popover` gets
  `max-width: calc(100vw - 16px)` (the existing `placePopover()` already
  clamped position, not width). `.ptg-bar-absence` — 15px tall by default,
  only growing on `:hover` — stays permanently at its expanded height under
  `@media (hover: none) and (pointer: coarse)`, since touch has no hover to
  reveal it and the whole touch strategy depends on taps landing on the bar.
- **Out of scope:** calendar nav/day/year controls (24-30px, functional,
  `.ptg-cal-navbtn` already meets WCAG 24×24 AA) and `.ptg-handle` resize-
  handle sizing (moot — touch never engages it) are left as-is.

## 1.0.0 — 2026-08-18

Initial version. Per-project, resource-centric team timeline for project
managers — forked from `assignment-grid` (day/week span-native timeline, drag
state machine, popover/calendar widgets), scoped to one project's team instead
of the whole company.

- **Team rows are derived, not pre-filtered.** `deriveTeamResourceIds()` reads
  the full `allocation` catalog and collects every resource with ≥1 allocation
  to this instance's `project` input overlapping the visible range — the
  Appfarm placement does not need to pre-filter `resources`.
- **Allocations are read-only display.** No Tildeling (assign) flow exists in
  this view — direct project assignment stays in `assignment-grid`. A team
  member's allocation bars render but are never draggable
  (`.ptg-bar-readonly`, `pointer-events` inert for the cross-project variant).
- **Other-project allocations render grayed out** (`.ptg-bar-other-project`,
  `other-alloc` bar kind) on a team member's row so a PM can see why someone
  is only partially available — inert by construction (guarded in
  `onPointerDown` and `pointer-events: none` in CSS).
- **Absences are fully editable** (create/move/resize/delete) through a
  simplified popover (`showAbsencePopover`) — adapted from assignment-grid's
  `showAllocAbsencePopover` with the Tildeling/Fravær toggle removed entirely,
  since this view only ever creates absences. Same actions as assignment-grid
  (`allocationAbsenceSave`, `saveAbsenceDates`, `deleteAbsence`), same
  misspelled `abscenceType` param.
- **New "Ressursbehov" row** — a synthetic row (not tied to any resource),
  pinned first, rendering `projectResourceRequest` bars. Dragging its empty
  lane opens a new "Be om flere ressurser" popover (`showAskPopover`)
  collecting work type (single-select), trade skills (new `makeMultiSelect`
  checkbox widget — adapted from `makeFlatList`'s shell, not a verbatim port),
  resource count, and a free-text comment for HR staffing context. Creates/
  updates/deletes via new actions `createProjectResourceRequest` /
  `updateProjectResourceRequest` / `deleteProjectResourceRequest`.
- **New object class `projectResourceRequest`** — separate from
  resource-req-v2's aggregate `projectRequirements`/"Behov": carries a
  `comment` and a many-to-many trade-skill link, representing ad-hoc
  PM→HR-staffing communication rather than coverage math. **This data
  model/action set must be created in Appfarm alongside pasting this
  component.**
- **Trade skills are a proper many-to-many junction**, not an array field —
  new object class `projectResourceRequestTradeSkill` (data source
  `projectResourceRequestTradeSkills`, fields `{ projectResourceRequest,
  tradeSkill }`, both plain id strings, not expanded by Appfarm), same
  non-expansion pattern `assignment-grid` already uses for
  `resourceTradeSkills`. Joined client-side in `indexData()` into
  `skillsByRequest` (resolveId() on both ref fields, since Appfarm may hand
  either a plain id string or an expanded object) — mirrors
  `assignment-grid`'s `skillsByResource`/`resourceTradeSkills` join exactly.
  This component only **reads** the junction, same as assignment-grid does
  for `resourceTradeSkills`; the write side
  (`createProjectResourceRequest`/`updateProjectResourceRequest`) is
  unchanged — it still just sends a plain `tradeSkillIds` array, and
  Appfarm's action is responsible for materializing/diffing the junction
  rows from that array.
- **Ported verbatim from `assignment-grid`** (renamed `pl-` → `ptg-` where
  class strings are involved): date helpers, `loadTimeAxis`/`buildColumns`/
  `xForDate`/`colIndexFromClientX` (geometry), `applyPick`/`renderDayPicker`/
  `renderYearGrid` (calendar), `makeFlatList` (single-select), the drag state
  machine shape (`onPointerDown`/`onPointerMove`/`onPointerUp`), rebuild-guard
  triad (`guardedBuildAll`/`flushQueuedRebuild`/`removePopover`), tooltip
  helpers. Each carries a "Ported from assignment-grid/index.js:<line>" or
  "Adapted from …" comment at its definition — see CLAUDE.md's
  cross-component change-propagation note: a future assignment-grid bugfix to
  one of these should be grepped for here too.
- **Explicitly not ported (v1 scope, YAGNI):** job-ad ghost overlay (`jobs`,
  `goToBuilderAd`), `sortByProjects` grouping (this view is already
  single-project), `workTypeIcons`, `openResourceEdit`, the
  `resourceTradeSkills` per-person skill join + role-hover popover, PM/site
  manager role tags, and assignment-grid's summary rows (På prosjekt / Ledige
  / Totalt — company-wide semantics that don't translate to a single
  project's team). Any of these can be ported later following the same
  "ported from" convention if a PM view turns out to need them.
- **Root id is `#team-planner`** (not `#planner`) and internal control ids are
  distinct from assignment-grid's, so the two components can coexist on the
  same Appfarm page without id collisions.
