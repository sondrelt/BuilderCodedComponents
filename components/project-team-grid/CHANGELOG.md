# Changelog

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
  resource-req-v2's aggregate `projectRequirements`/"Behov": carries
  `tradeSkillIds` (array) + `comment`, representing ad-hoc PM→HR-staffing
  communication rather than coverage math. **This data model/action set must
  be created in Appfarm alongside pasting this component.**
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
