# Date-window navigation + full-screen layout for planner grids

## Context

`assignment-grid`, `project-team-grid`, and `resource-req-v2` all derive their visible date range from the shared, Appfarm-controlled `appfarm.data.viewFrom` / `viewTo` inputs (falling back to `new Date()` when unset). None of them currently write back to `viewFrom`/`viewTo`, and none has any navigation UI — the only way to move through time today is the native horizontal scrollbar within whatever fixed window `viewFrom`/`viewTo` already define.

The user wants to be able to move the visible date window from inside any of these three components — via prev/next arrows and via scrolling/swiping — and have that change flow back into the shared `viewFrom`/`viewTo` values so all planner-family components (including `resource-graph-v2`, which already listens for `viewFrom`/`viewTo` changes) stay in sync. They also want these three components to use the full browser viewport (minus the Appfarm chrome above them) instead of self-capping their scroll area.

Confirmed assumptions (from user answers):
- `viewFrom`/`viewTo` are writable page-level variables, the same class of value as `viewGranularity`, which the code already writes directly via `appfarm.data.viewGranularity?.set?.(...)` with no dedicated action. We'll write `viewFrom`/`viewTo` the same way. If this turns out to be wrong once pasted into Appfarm Create, the fallback is to add a `setViewWindow`-style action instead — flagged as a risk, not blocking the plan.
- Arrow-button step ≈ 3 weeks. Scrolling to the edge of the *loaded* buffer should extend the buffer by 6 weeks in that direction, while the amount of history/future actually rendered stays the same size (i.e. a sliding window, not unbounded growth) and the visible viewport width is untouched.
- Full-screen change applies to the same three components only; `resource-graph-v2` and `email-html-editor` are untouched.

There is no shared-module system for coded components (hand-pasted, no `import`s), so the navigation logic is duplicated near-verbatim into each of the three `index.js` files, following the existing precedent (`project-team-grid`'s `loadTimeAxis`/`buildColumns` was already ported "verbatim" from `assignment-grid`).

## Design: sliding buffered window

- **Buffer** = the full `viewFrom`→`viewTo` span currently loaded and rendered as columns (today: ~12 weeks for the grids, ~20 for `resource-req-v2`, unchanged).
- **Viewport** = whatever fits in the `.pl-scroll`/`.ptg-scroll`/`.rp-scroll` container without scrolling — untouched by this change.
- **Arrow buttons (◀ ▶)**: page the native scroll position by `STEP_WEEKS = 3` weeks worth of pixels (`scrollEl.scrollBy({ left: ±3 * weekPx, behavior: 'smooth' })`). This is a pure client-side pan within the already-loaded buffer — no Appfarm write by itself.
- **Edge detection**: a single `scroll` listener on the same scroll container (fires for arrow-triggered scroll, trackpad/touch swipe, and manual scrollbar drag alike) checks `scrollLeft` against the buffer edges. When within `EDGE_THRESHOLD_WEEKS` (2) of an edge:
  - Shift both `viewFrom` and `viewTo` by `EDGE_SHIFT_WEEKS = 6` weeks in that direction (`appfarm.data.viewFrom?.set?.(...)`, `viewTo?.set?.(...)`), keeping the total buffer span constant — this both loads new weeks ahead and drops the same number behind, so the buffer doesn't grow unbounded over a session.
  - After the resulting rebuild, compensate `scrollLeft` by the equivalent pixel width of the shift so the visual position doesn't jump.
  - Guard with an `isShifting` flag (cleared after rebuild) so a burst of scroll events during the round-trip doesn't fire multiple shifts.

This reuses each component's existing per-column pixel-width constant to convert "weeks" to pixels:
- `assignment-grid`: `COLW[granularity]` (`index.js:53`) — weeks-to-px depends on granularity (`week` mode: weeks × 75; `day` mode: weeks × 7 × 75).
- `project-team-grid`: `COLW_DESKTOP`/`COLW_MOBILE` + its existing `getColW()`-style helper (mirrors assignment-grid, adjust for the responsive breakpoint).
- `resource-req-v2`: `COL_W` (`index.js:167`, per-day pixel width) — weeks-to-px = weeks × 7 × `COL_W`.

## Per-component changes

### 1. `components/assignment-grid/index.js`
- Fix the change-listener typo at `index.js:1782`: `'viewStart', 'viewEnd'` → `'viewFrom', 'viewTo'`. Without this fix the grid never reacts to the shared window changing (from its own edge-shifts or another component's), so this is a prerequisite, not optional cleanup.
- Add `shiftWindow(deltaWeeks)`: reads current `viewFrom`/`viewTo` (falling back to `rangeStart`/`rangeEnd`), adds `deltaWeeks * 7` days to both, writes them back via `.set()`.
- Add `stepView(direction)`: `scrollBy` the `#planner-scroll` element by `direction * STEP_WEEKS` weeks of pixels (smooth).
- Add a `scroll` listener on `#planner-scroll` implementing the edge-detection/shift/compensate logic above.
- Add ◀ ▶ buttons into the `.pl-controls` toolbar built in `ensureSkeleton()` (`index.js:1735-1749`), next to the existing granularity toggle, wired to `stepView(-1)`/`stepView(+1)`.

### 2. `components/project-team-grid/index.js`
- Same additions as above (`shiftWindow`, `stepView`, edge-detection scroll listener, ◀ ▶ buttons in `.ptg-controls` from `ensureSkeleton()` at `index.js:1530`). Its `viewFrom`/`viewTo` listener is already correct (`index.js:1579-1582`), no typo fix needed here.

### 3. `components/resource-req-v2/index.js`
- Same `shiftWindow`/edge-detection logic, using `COL_W` for the weeks-to-px conversion.
- This component has **no toolbar today** — `ensureSkeleton()` (`index.js:1864-1871`) only builds `#rp-scroll > #rp-inner`. Add a small controls bar (new `.rp-controls` div with ◀ ▶ buttons) above `#rp-scroll`, styled minimally to match the component's existing visual language.
- Wire the buttons to `stepView(±1)`, and add the same `scroll` listener on `#rp-scroll`.

## Full-screen layout (same 3 components)

For each component's `styles.css`:
- Root element (`#planner`, `#team-planner`, `#req-planner`): change `height: 100%` to `height: 100vh` (keep `box-sizing: border-box`) so the component claims the full viewport height itself rather than depending on ancestor height propagation.
- Scroll frame (`.pl-scroll` / `.ptg-scroll` / `.rp-scroll`): remove the `max-height: 85vh` cap, replace with `flex: 1; max-height: none;` (each already has `flex: 1` or is inside a flex column) so it fills all remaining vertical space under the toolbar instead of self-capping at 85% of the viewport.

Note: this makes the component consume the full browser viewport height assuming it's placed directly under Appfarm's own menu bar with no other chrome above it. If Appfarm's page layout adds its own wrapping padding/toolbar, `100vh` may overshoot — flag this for a quick visual check after pasting into Appfarm Create Development, and fall back to a `calc(100vh - Npx)` if so.

## Versioning / workflow

Per `CLAUDE.md`'s branch/commit convention, one feature branch per component (or one branch covering the shared feature if preferred — confirm naming), bump versions and changelog:
- `assignment-grid`: 1.13.0 → **1.14.0** — "scrollable date window + full-screen layout"
- `project-team-grid`: 2.2.0 → **2.3.0** — same
- `resource-req-v2`: 1.27.1 → **1.28.0** — same

No `component.json` input/action changes needed (`viewFrom`/`viewTo` already declared as inputs in all three; written via `.set()`, not a new action).

## Verification

- Static/local: no build step exists for these vanilla-JS components; verify by eyeballing the diff and checking `COLW`/`COL_W` usage is consistent (no live Appfarm check available in this workflow — only local review before paste).
- Manual paste-and-click-through in Appfarm Create (Development environment) once pasted, per the existing workflow:
  - Confirm ◀ ▶ buttons page the view by ~3 weeks.
  - Confirm scrolling/swiping to either edge of the loaded buffer extends it by 6 weeks without a visible jump, and that `viewFrom`/`viewTo` actually persist (check the Appfarm data source values update) — this is the step that validates the "writable like `viewGranularity`" assumption.
  - Confirm that shifting the window in one component (e.g. `assignment-grid`) is reflected in the others (`project-team-grid`, `resource-req-v2`, `resource-graph-v2`) after their own `change` listeners fire.
  - Confirm each component now fills the viewport height minus the Appfarm menu, with no double scrollbars.
