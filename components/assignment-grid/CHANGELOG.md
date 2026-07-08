# Changelog

## 1.11.3 — 2026-07-08

- **Now-line scoped to project/resource rows only.** 1.11.2 ran the line
  through the sticky calendar header down to the very bottom of the grid
  (including the summary rows). It now spans from 2px above the first
  project title row to the bottom of the last resource row — reads the real
  offsets of both boundary rows (already in the DOM when this runs) instead
  of guessing a fixed span.

## 1.11.2 — 2026-07-08

- **Now-line gap fix, properly this time.** 1.11.1's `header.offsetHeight - 2`
  measurement left a gap in practice — it's read before web fonts finish
  loading, so a later font swap shifts row heights and the stored offset goes
  stale. Replaced with a structural fix: the line spans the full height again
  (`top: 0`) and sits above the header in z-index, so it runs straight through
  into the current-week underline with no measurement to go stale.

## 1.11.1 — 2026-07-08

- **Now-line merges into the underline instead of a flag.** 1.11.0's triangle
  flag read as an extra, separately-positioned shape; dropped it. The line now
  simply starts 2px above the header's bottom edge, running up into the
  current-week cell's amber underline so the two read as one continuous mark.

## 1.11.0 — 2026-07-08

- **Today flag on the now-line.** A small triangle now sits at the header's
  bottom edge, tip on the exact day, so the now-line reads as pointed-to
  instead of appearing to start out of nowhere right under the sticky header
  (which otherwise hides it — higher z-index).
- **Current-week header cell toned down.** Replaced the box-shadow ring +
  bold-800 fill with just a soft tint + bottom underline — marks "this week"
  without boxing the cell in, since the flag/line below already pinpoints the
  exact day.

## 1.10.0 — 2026-07-08

- **Project-colour left stripe continues down every resource row**, not just
  role rows — matches resource-req-v2's label-cell stripe running from the
  title row through the whole group. Prosjektleder/Anleggsleder rows still
  override it with their own blue/green accent (unchanged, just now painted
  over a coloured base instead of a plain one). `renderRow` takes a `color`
  param; unassigned/absence pseudo-groups pass their existing grey/red group
  colours through too, so the stripe never breaks across the grid.

## 1.9.1 — 2026-07-08

- **Column gridlines on the title row.** The full-width project tint (1.9.0) sat
  as a blank band with no gridlines; a new `.pl-group-grid` element draws the
  same column lines over its timeline portion, anchored to the timeline's left
  edge (not the row's own background, which would tile the pattern back under
  the sticky label).

## 1.9.0 — 2026-07-08

- **Project tint on the title row now spans the full row**, not just the sticky
  label chip — the muted project-colour tint reads as a title band across the
  whole timeline width, matching the full-width `.pl-group-sep` line beneath it.

## 1.8.0 — 2026-07-08

- **Trade skills.** New `resourceTradeSkills` input (junction records:
  `{ resource, tradeSkill }`, both plain id strings — not expanded by Appfarm)
  joined client-side against a new `tradeSkills` input (the Trade Skill
  catalog: `{ _id, name, description }`) surfaces each resource's specialized
  skills (e.g. wood carving).
  The position ("stilling") column has a strict display hierarchy for its
  limited space — **leder (role tag) > tradeskill (skill chips) > stilling**
  — only the single highest-priority tier that applies is shown inline (a
  role tag fully replaces skill chips inline, which in turn replace the
  position text; each is still reachable via `title`/the hover popover
  below). For a skills-only row, the first 2 skills always show by name; a
  3rd+ collapses into a "+N" badge (hover for the full list) once measured
  post-render not to fit.
- **Hovering the position field opens a popover** whenever there's a role or
  skills to reveal, listing whatever applies, always in full: role label (if
  any) → trade skills with descriptions (if any) → stilling. A plain
  stilling-only row has nothing hidden (its position text is already visible
  inline) so gets no popover there — just the default cursor and its
  existing `title` tooltip; the help-cursor affordance only appears on rows
  that actually have one. Moving off the field — including onto the name,
  work-type icon, or edit-pencil in the same row — closes it. Independent of
  the existing alloc/absence-editor and job-ads popovers — this one is
  passive/read-only and doesn't gate rebuilds while open.
  Fixed a bug where the popover, once shown, never actually closed on
  mouseleave: `showRolePopover()` called `hideRolePopover()` internally to
  clear any stale DOM node, but `hideRolePopover()` also reset the
  `roleHoverResourceId` hover-tracking variable — wiping out the value
  `onRoleHoverMove()` had just set, so the "is anything open to hide"
  check silently no-oped from then on. Split into a DOM-only removal inside
  `showRolePopover()` versus the full reset in `hideRolePopover()`.
  `text-overflow: ellipsis` was moved off the shared column container onto a
  dedicated `.resource-position-text` span around just the trailing text —
  Chrome's ellipsis handling is unreliable when the overflowing content mixes
  plain text with inline-block elements (chips), and could silently swallow
  an entire chip and paint "…" in its place even though that chip's own
  layout geometry fit.
- **Work-type column is now an icon, not text.** New `workTypeIcons` input
  (`{ workType, __fileContentLink }`, matched against `resource.workType`)
  replaces the work-type name text with its icon, freeing horizontal space
  (grid column 100px → 40px) for the skill chips. The trade name is preserved
  as the icon's `alt`/`title` tooltip.
- **Search now matches trade skill names** too, alongside the existing
  name/work-type/position matching — typing e.g. "wood carving" surfaces
  resources with that skill.

## 1.7.0 — 2026-07-03

- **Job-ad ghost opens a popover instead of navigating directly.** Clicking a
  resource's free-gap "ghost" band no longer jumps straight to an ad — it opens a
  popover listing every matching ad in that gap (company, tier badge, resource
  count, date range, title). Clicking a row navigates to the ad; Esc / click-outside
  closes. Same shell/behaviour as the allocation/absence editor popover. Ported
  from resource-req-v2's ads popover (1.19.0).
- **`openJob` replaced by `goToBuilderAd`** (`{ jobId }`), matching resource-req-v2's
  action shape for parity — its `resourceAvailableId` branch is never exercised here
  since assignment-grid only ever surfaces Job ads.
- **Ghost mark is now the same info icon as resource-req-v2's ads indicator**
  (was a plain "↗" arrow character). Count badge sits directly next to the company
  name instead of pinned to the far right of the (potentially date-range-wide) ghost
  band, and reads "N stk" instead of a bare number — both in the ghost band and the
  popover's per-ad count.

## 1.6.0 — 2026-07-02

- **Updates use dedicated save actions.** Move/resize (drag) and popover edits of an
  existing record now call `saveAllocationDates` / `saveAbsenceDates` instead of
  `allocationAbsenceSave` (which is create-only and, being a merge action, no-oped on
  edits). Both new actions registered in `component.json`.
- **Absence type now persists on edit.** The type picker's value is coerced to the
  numeric enum (`Number(...)`), and the type param is sent under the action's spelling
  `abscenceType` — sending the correctly-spelled `absenceType` arrived as `undefined`
  and silently no-oped the save.

## 1.5.0 — 2026-06-26

- **Editor popover redesign** (restored from earlier lost work; number/save logic
  unchanged):
  - **Fra dato / Til dato** fields replace the Fra/Til chips; clicking a field opens the
    day picker in a collapsible panel below (no longer an always-visible calendar) and
    closes it on pick. The active field gets a navy ring; calendar highlight uses navy.
  - Action row is a low-emphasis **Slett** (trash icon, red on hover) + amber **Lagre**.
    Dropped the **Avbryt** button and the hint line — Esc / outside-click still cancel.
  - Selection is a searchable **flat list** (Søk filter, colour dots, dashed-orange
    selected row) instead of the dropdown select. New entries must pick
    Allokering/Fravær first ("Velg allokering eller fravær" prompt).
  - Popover capped to the viewport (scrolls internally) and re-clamps when the calendar
    opens/closes or the kind changes, so it can't pop off-screen.

## 1.4.0 — 2026-06-26

- **Tier-prioritized job ads.** Job ghosts in a resource's free gaps are now ranked
  **internt → partnere → alle** (by the ad's pre-computed `tier` field) before
  collapsing, so the primary/clicked ad and the ghost's accent colour reflect the best
  available tier (green = internt, amber = partner, blue = alle).
- **Ghosts name the posting company.** The ghost label now shows which company posted
  the ad (single company → its name; multiple → "Company +N andre"), with a per-company
  breakdown (count + tier) in the tooltip. No new input — relies on `company` + `tier`
  on the existing `jobs` source.

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
