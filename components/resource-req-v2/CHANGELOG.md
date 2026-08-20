# Changelog — resource-req-v2

## 1.24.1 — 2026-08-20

- **Gap-band line: exaggerated first step off zero.** A plain linear position
  scale put magnitude 1 only 1/5 of the way to the row edge — easy to mistake
  for noise against the dashed 0-line. `gapLineY` now jumps to 35%
  (`GAP_MIN_FRAC`) of the max offset on the very first unit (0→1), then
  splits the remaining distance evenly across 1→2→3→4→5, so a value of ±1
  reads unmistakably as "off zero" while relative magnitude above that still
  scales faithfully.

## 1.24.0 — 2026-08-20

- **Coverage-gap band redrawn as a continuous gradient line/area**, replacing
  the discrete numbered bars. Each work-type band now shows one SVG line per
  row, dipping below a centred 0-baseline for understaffing and rising above
  it for surplus, so severity reads from shape instead of digits.
  - **Position saturates at |value|=5** — a gap that severe already means
    "look here", so the line simply pins to the row's top/bottom edge from
    there on; exact magnitude beyond 5 no longer moves the line further.
  - **Colour keeps deepening from 5 to 10** (then clamps) even after the
    line has pinned, reusing the existing palette (green = old covered tone,
    mid = old "mag 3" red/blue, max = the root `--rp-red-700`/`--rp-blue-700`
    tokens) — so two maxed-out rows can still be told apart by saturation.
  - Weeks with no Behov registered ('none' state) break the line entirely;
    the diagonal hatch that used to live on a per-bar class is now baked
    permanently into `.rp-track-gap`'s own background, so it shows through
    unobstructed wherever no run covers it — no extra per-range styling
    needed.
  - Exact numbers move to a hover tooltip (`Udekt −3 · uke 34` etc.) instead
    of being shown by default; `setTooltip` was generalized to take
    already-formatted text (was hardcoded to "N uke(r)").
  - **Marketplace ads icon is now peak-only**: one icon per deficit/surplus
    hump (a contiguous run of the same sign), anchored at its single most
    severe week, instead of one per every distinct-value sub-run — a long
    bumpy or flat stretch now gets exactly one marker. Same click →
    `showAdsPopover` behaviour.
  - Removed `magBucket` and all `data-mag` styling — colour is now a
    continuous function of the value, not a 3-step bucket.

## 1.23.0 — 2026-08-20

- **Source row order reduced and reordered to cut cognitive load.** Each
  work-type band's detail rows are now Behov then Egne — the two used daily —
  instead of the old fixed Behov/Innleide/Utleide/Egne/Udekt/Overskudd order.
- **Udekt/Overskudd detail rows removed entirely.** They were pure duplication
  of the number already shown on the always-visible work-type gap band
  (`makeGapBandTrack`) — no new place to look, one fewer scroll of rows.
- **Innleide/Utleide now hidden until they have a registered period.** An
  empty Innleide or Utleide row no longer clutters every band; once either has
  at least one period it renders permanently, same drag-to-create/click-to-edit
  behavior as before.
- **New "Flere alternativer" icon**, next to the work-type name on the gap
  band row, appears whenever Innleide and/or Utleide are still hidden
  (skipped for exception trades — read-only, nothing to add). Opens a small
  menu offering "Legg til innleide"/"Legg til utleide" for whichever is
  missing; picking one opens the existing quantity popover directly with a
  default one-week window, letting the from/to date be set there instead of
  requiring a drag gesture on a row that isn't shown.

## 1.22.2 — 2026-08-11

- **Summary section left stripe extended down through every work-type row**,
  not just the "Alle prosjekter" header — same continuous-stripe technique as
  the per-project colour stripe, so the navy edge marks the whole aggregation
  section as one group. Underline position unchanged (still directly under
  the header row, from 1.22.1).

## 1.22.1 — 2026-08-11

- **Summary section separator line** moved to sit directly under the "Alle
  prosjekter" header row (matching `.rp-group-sep`'s position under each
  project's title row), instead of trailing after all the work-type rows.

## 1.22.0 — 2026-08-11

- **New global summary section** at the top of the grid: one coverage-gap band
  row per work type that has data anywhere (planned Behov or allocated Egne,
  across every project), summed for each visible week and classified with the
  same deficit/surplus/covered/no-demand logic as the per-project bands — no
  per-source breakdown at this level. Renders inside the same scrolling grid
  as the per-project rows so its week columns stay aligned with the calendar
  axis while scrolling horizontally.

## 1.21.4 — 2026-07-08

- **Current-week header cell toned down**, matching assignment-grid: replaced
  the box-shadow ring + bold-800 fill with just a soft tint + bottom
  underline — marks "this week" without boxing the cell in on all sides,
  since the now-line below already pinpoints the exact day.

## 1.21.3 — 2026-07-08

- **Now-line scoped to project/work-type/source rows, visible over the title
  tint.** Ported from assignment-grid: the line now spans from 2px above the
  first project title row to the bottom of the last row (reading real
  offsets, not the sticky calendar header's height), and its z-index now
  beats `.rp-group-head` (20) so it stays visible crossing the title row's
  colour tint instead of disappearing behind it.

## 1.21.2 — 2026-07-08

- **Week gridlines on the title row.** The full-width project tint (1.21.0) sat
  as a blank band with no gridlines; a new `.rp-group-grid` element draws the
  same column lines over its timeline portion, anchored to the timeline's left
  edge (not the row's own background, which would tile the pattern back under
  the sticky label).

## 1.21.1 — 2026-07-08

- **Gap-band number gets its own background pill** instead of the shared
  full-width `.rp-bar-count` overlay, so the week gridline is masked only right
  behind the digit (and its ads icon) — not blocked across the whole run like a
  solid bar would. Replaces the old text-shadow halo, which didn't fully occlude
  a hard-edged line crossing straight through the glyph.

## 1.21.0 — 2026-07-08

- **Week gridlines on the work-type gap band.** The coverage band track was
  explicitly hiding the column gridlines (`background-image: none`); removed so
  the week lines run through every row, not just the source detail rows below it.
- **Project tint on the title row now spans the full row**, not just the sticky
  label chip — the muted project-colour tint reads as a title band across the
  whole timeline width, matching the full-width `.rp-group-sep` line beneath it.

## 1.20.0 — 2026-07-03

- **Anonymized "probable capacity" signals in the ads popover.** New
  `peerAllocations` input (same shape as `allocation`: resource, project,
  workType, dateFrom, dateTo — resource identity stripped) surfaces peer-org
  capacity that was never formally posted as a Resource Available ad. Only
  records with no `project` (uncommitted/free) count as a signal; committed
  peer records are ignored.
- Probable capacity appears on the lease-in (deficit) side only, below a
  "Sannsynlig kapasitet" divider, as up to 3 rows — one per tier — each an
  aggregate count of overlapping free peer records, not a real posting. Rows
  are informational only: no company name, no click action, no
  `goToBuilderAd`. Real posted ads always sort ahead of probable rows
  regardless of tier; probable rows are internally ranked
  internt → partner → alle same as real ads.
- **Ads indicator badge counts real ads only** — probable signals are visible
  only inside the popover, so the badge number never promises more than is
  actually postable/navigable. A gap with only probable capacity and zero real
  ads shows no indicator (v1).

## 1.19.1 — 2026-07-03

- **Ads popover count reads "N stk"** instead of a bare number, matching
  assignment-grid's job-ad popover/ghost wording.

## 1.19.0 — 2026-07-02

- **Ads icon + popover on the coverage band.** The inline availability markers
  (`.rp-avail`, company name + count) are replaced by a small info icon next to the
  gap number on deficit/surplus runs that have matching ads. The whole run bar is a
  click target too — the icon is the affordance hint. Clicking it opens a
  self-contained popover (same shell as the count popover) listing each ad:
  company, tier badge (internt/partner/alle), resource count, date range, title.
  One icon per run bar — ads are aggregated across the run's columns; per-ad date
  ranges in the popover carry the precision (the `availSignature` sub-segmentation
  is gone).
- **Row click → `goToBuilderAd`** with `{ jobId }` (surplus/Job ads) or
  `{ resourceAvailableId }` (deficit/Resource Available ads).
- **Removed** the "Se detaljer" search button on the Udekt/Overskudd detail rows
  and **all `viewBuilderAds` calls** — the action can be unwired from the component
  in Appfarm; wire up `goToBuilderAd` instead.

## 1.18.0 — 2026-06-26

- **Count popover redesign** (restored from earlier lost work; count/save logic
  unchanged) — now matches the assignment-grid editor:
  - **Fra dato / Til dato** fields replace the Fra/Til chips; clicking a field opens the
    day picker in a collapsible panel below (no longer an always-visible calendar) and
    closes it on pick. Active field gets a navy ring; calendar highlight uses navy.
  - Action row is a low-emphasis **Slett** (trash icon, red on hover) + amber **Lagre**.
    Dropped the **Avbryt** button and the hint line — Esc / outside-click still cancel.
  - Popover clamps to the viewport and re-clamps when the calendar opens/closes, so it
    can't pop off-screen.

## 1.17.0 — 2026-06-26

- **Marketplace availability on the coverage band.** Deficit (−N) and surplus (+N)
  runs on a work-type band now surface matching marketplace ads inline: deficit weeks
  show lease-IN supply (Resource Available ads, ↓ "ledige"), surplus weeks show
  lease-OUT demand (Job ads, ↗ "oppdrag"). Each marker shows the total count and the
  **posting company** (single name, or "N selskaper" with a per-company breakdown in
  the tooltip), and clicking opens the marketplace (`viewBuilderAds`) filtered to that
  work type + direction + best tier.
- **Tier priority.** Ads are matched work-type-implicitly and ranked
  **internt → partnere → alle**; the marker's accent colour reflects the best
  available tier. Ads arrive pre-tagged with a `tier` field from Appfarm (the
  component does not resolve partnerships itself).
- **New inputs:** `jobs` (Job ads) and `resourcesAvailable` (Resource Available ads).

## 1.16.0 — 2026-06-26

- **Editable sources first.** Source rows under each work-type band are reordered
  so the editable ones (Behov, Innleide, Utleide — what you draw) sit at the top
  and the computed/read-only rows (Egne, Udekt, Overskudd) below, instead of the
  old demand→cover→gap interleave. Editability is now the primary row split.
- **Read-only rows recede.** The computed rows carry a faint warm-grey fill
  (`--rp-readonly-bg`) so they read as a recessed "computed zone"; editable rows
  stay white as the working surface. Pairs with the existing diagonal hatch on
  derived bars. CSS-only (`.rp-row-derived`); no behaviour change.
- **Fix phantom out-of-window bar.** An editable requirement whose period fell
  entirely outside the visible date range rendered as a stray column-wide bar
  just past the grid's right (or left) edge — `makeBar`'s `Math.max(_, COL_W)`
  width floor inflating a clamped zero-width span. `makeEditableTrack` now skips
  records that don't overlap `[rangeStart, rangeEnd]`, matching the derived rows.

## 1.15.1 — 2026-06-26

- **Exception trades are read-only.** Own people on a work type the project never
  planned no longer expose editable Behov/Innleide/Utleide tracks — you can't draw
  or edit a requirement span on an unplanned trade. Their source rows render with
  the read-only derived renderer (no drag-to-create lane, no span editing).
- **Continuous project stripe.** The project-colour left stripe on the title row and
  the sticky label cells is now one unbroken line — the row separator is drawn as an
  inset shadow *under* the stripe instead of a border that nicked it at every row.
- **Beige pills.** Source span/derived bars are a warm beige toned with the app
  background (`#f8f1e1`) instead of cold grey.

## 1.15.0 — 2026-06-26

Built on master (1.11.0); supersedes the unmerged role-first WIP (1.12–1.14 on
`feat/resource-req-v2`), which flipped the hierarchy but dropped the aggregation
band so source and work type read as one undifferentiated block.

- **Work-type-first layout.** Hierarchy pivoted from project → source → trade to
  **project → work type → its source rows** (Behov, Egne, Innleide, Utleide, Udekt,
  Overskudd in fixed order). Each trade is the dominant grouping level; collapsing a
  project leaves just the trade bands.
- **Coverage-balance band.** The work-type band shows the coverage balance per
  week (`bal = Egne + Innleide − Behov`) so **surplus reads +N (Overskudd)** and
  **deficit −N (Udekt)**. Four distinct states:
  - **No demand** — no Behov record this week (project ended / not started / not
    filled in): a faint hatch with **no number**, kept deliberately distinct from a
    confident covered-0. Behov *presence* is tracked independently of count, so a
    registered `0` still reads as covered.
  - **Deficit (Udekt)** — `bal < 0`: warm underline, shows `−N`.
  - **Surplus (Overskudd)** — `bal > 0`: cool underline, shows `+N`.
  - **Covered** — `bal == 0` with Behov present: calm neutral `0`.
  Designed like the source aggregation rows in the original layout — a faint band
  tint with the value as a **floating underlined-number marker** plus short vertical
  end-ticks per run, rather than a filled cell. State rides the underline + ticks
  colour; magnitude deepens it across three steps.
- **Colour as signal, not category.** The coverage band is the only saturated layer
  (two semantic hues). Source rows are monochrome ink; category identity comes from
  fixed row order, the label, and a 3px colour tick — removing five of the six
  per-source fills to cut visual load in a dense grid.
- **Bar species stay distinct without hue.** Editable span pills (border + shadow +
  handles) vs. hatched derived rows vs. the colour-filled band — a three-way
  structural separation that replaces per-source colour as the parsing cue.
- **Marketplace entry moved.** `viewBuilderAds` ("Se detaljer") now lives on the
  Udekt/Overskudd source detail rows. Dropped the cross-work-type source summary
  rows (`makeSummaryTrack`) and the now-unused header aggregate.

## 1.11.0 — 2026-06-25

- **Egne aggregates by the resource's own trade, one row per person.** An allocation's
  `workType` is the resource's own trade (independent of the work types the project lists
  as needed), so each present person now lands in exactly the row for their trade — never
  duplicated across rows. Reverts the 1.10.0 untagged-fallback that counted an off-trade
  person toward *every* needed-type row (the same person showing in both Anleggsgartner
  and Banemontør).
- **Exception rows for off-plan trades.** When an own person's trade isn't one the project
  listed as needed, Egne now shows an extra row for that trade, marked as an exception
  (italic amber label + ⚠), instead of silently dropping the person or smearing them
  across the needed-type rows. New `agg.egneExtraWTs`; `.rp-row-exception` style.
- **Egne total = sum of all its rows (needed + exception).** Since every person sits in
  exactly one row, the total equals the distinct present persons project-wide and always
  equals the rows beneath it.
- Absence netting unchanged: a person absent in a given week is excluded from that column
  in their row (and therefore the total).

## 1.10.0 — 2026-06-23

- **Fix Egne showing 0.** The Egne summary header was a cross-work-type sum of the
  per-work-type detail sets, so any allocation whose `workType` wasn't a configured
  `projectWorkType` row was silently dropped from the total (and work-type-less
  persons were double-counted). The header now counts **distinct present persons
  project-wide** per week (allocation − absence), independent of work-type matching —
  matching resource-graph-v2's "Egne ansatte".
- **Per-work-type Egne bars now render.** The work-type detail rows draw the same
  hatched read-only bars as Udekt/Overskudd. Attribution: an allocation tagged with
  one of the project's work types lands in that row only; an allocation with no work
  type, or one the project doesn't list, counts toward every work-type row (so the
  rows don't go blank when allocations aren't tagged with the project's exact work
  types). The summary header stays a distinct project-wide count.
- **Project colour marking.** Each project now carries a left accent stripe pinned to
  the sticky panel (stays visible while scrolling horizontally) and a full-width line
  in the project colour directly under the project title row, spanning the whole
  timeline. The
  group header's full saturated fill is replaced with a muted tint so it no longer
  clashes with the Egne-green / Innleide-amber source bands. New `--proj-color` row
  property + `.rp-group-sep` element; removed the now-unused `getContrastColor`.

## 1.9.0 — 2026-06-19

- Count-popover period picker reworked for long ranges (up to ~2 years) and
  **exact-day precision** (was whole-week). Fra/Til are now two independent
  ends sharing one calendar surface that switches to the active end; each end
  keeps its own month view.
- Calendar navigation matches the app's date picker: `‹ ›` step the month, and
  the `Måned ÅÅÅÅ ▾` title opens a scrollable 4-column **year grid** to jump
  years in one click. Selected day is an amber circle.
- Dropped week-snapping and the calendar's "Uke" column. `confirm()` now emits
  the exact picked dates (`startOfDay`..`endOfDay`); bars may start/end
  mid-week. Week-level aggregation is unchanged (still paints any overlapping
  week).
- from ≤ to enforced on pick (picking one end nudges the other). Replaced the
  two-click week-range logic (`nextWeekSelection`) with `applyPick` + day-clamp
  self-check (`demo()`).

## 1.8.0 — 2026-06-19

- Egne ansatte now matches resource-graph-v2 1.2.0: counts **distinct allocated
  persons** present per work type/week, **minus** any resource absent that week.
  Was: `+1 per allocation row`, no person-dedup, no absence.
- New `absence` data source (`resource`, `dateFrom`, `dateTo`); person-global
  (no project/workType), indexed once per render into `absentByCol`. Added to
  the change-listener set so the planner rebuilds when absence changes.
- Two allocations for the same person on a project in one week now count once.
- Known structural limits (not bugs): the planner is per-project, so a person
  allocated to two projects in a week counts once per project (the graph's
  global total counts them once); and a workType-less allocation is distributed
  into every work type, so the all-worktypes header over-counts such a person
  vs the graph's single bucket. Both only bite in those edge cases.

## 1.7.0 — 2026-06-18

- Count popover ("Antall ressurser") now has an editable **Periode** picker: a
  custom inline calendar styled to match the navy popover. It seeds with the
  click/drag period (Fra/Til chips show the current selection), hovering a row
  highlights the whole Mon–Sun week, and clicking selects weeks (two-click range,
  swaps if the end is earlier). Selections snap to whole ISO weeks on Lagre, so
  periods can be adjusted without re-dragging. Both create and edit flows pass the
  picked dates into createProjectRequirement / updateProjectRequirement.

## 1.6.0 — 2026-06-18

- Editable rows now carry a drag lane beneath each span: you can drag a new span
  in that lane even where a long bar already covers the area — letting you split a
  long period with a small span. Moving the cursor into the lane under a span
  lifts just that span (the span body stays put — it's the grab zone), pointing
  to where the split will land. createProjectRequirement handles the split/trim
  server-side. Mirrors assignment-grid.

## 1.5.0 — 2026-06-18

- Source-header aggregate rows: removed the vertical week gridlines that crossed
  the numbers/underline markers, and bumped the value to weight 700 with a light
  halo — the sums read clearly off the tinted band now.
- Derived work-type aggregate rows now render with a diagonal hatch over the
  category colour, so they're visibly read-only/computed instead of looking like
  the solid, draggable editable bars.

## 1.4.0 — 2026-06-18

- Aggregate source-header rows (Behov/Egne/Udekt/Overskudd etc.) now render 0 as
  a real span: empty weeks read "0" instead of a blank gap, so the summary row is
  continuous. Work-type detail rows keep blank gaps for 0.
- Clicking a single week in an editable track (no drag) now opens the count
  popover for that one week — same as dragging across a single week.

## 1.3.5 — 2026-06-16

- Fixed the sum-marker line reading grey/black: it was derived from the
  near-white band tint (--rp-<src>-bg), which has no hue left to darken into a
  colour. --sum-line is now derived per source from the saturated bar colour
  (color-mix(--rp-<src>-bar, #000 25%)), so the line/ticks are a soft blue /
  amber / red / green matching the source.

## 1.3.4 — 2026-06-16

- Sum-marker line is now a darker shade of the same hue instead of a grey/black:
  --sum-line uses color-mix(in srgb, var(--sum-tint), #000 20%), so each source's
  line matches its band colour (darker blue / amber / red / green), not black.

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
