// =============================================================================
//  Project Requirements Planner — v2 (optimized rewrite)
//
//  Data source:  projectRequirements { project, source, workType, dateFrom, dateTo, resourceCount }
//  Also read:     allocation { project, workType, resource, dateFrom, dateTo },
//                 absence { resource, dateFrom, dateTo } (person-global) — Egne
//                 = distinct allocated persons present, minus absent, per week.
//  Appfarm actions called (all via optional chaining — a missing action is a
//  silent no-op instead of a thrown TypeError):
//    createProjectRequirement { projectId, source, workType, dateFrom, dateTo, count }
//    updateProjectRequirement { projectRequirementId, dateFrom, dateTo, count }  (project/source/workType never change after create — not passed)
//    deleteProjectRequirement { projectRequirementId }
//    toggleDetails / editProject / openGraph (unchanged)
//    goToBuilderAd { jobId } (surplus/Job ad) or { resourceAvailableId } (deficit/Resource Available ad)
//
//  Changes vs v1 (no functionality or UX removed):
//    • Ghost bar now STAYS VISIBLE while the count popover is open, and is
//      promoted to a real-looking bar instantly on confirm (optimistic UI).
//      The datasource change then rebuilds and swaps in the persisted bar.
//    • Click-editing an existing bar updates its count optimistically too,
//      and the popover gains a "Slett" button (wired to deleteProjectRequirement,
//      shown only when that action exists).
//    • activeEdit guard is actually wired: rebuilds are QUEUED (not dropped)
//      while the popover is open or a drag is in progress, then flushed.
//    • All enum/work-type values are normalized to integers at every read
//      (enum datasources and stored records can disagree on string vs number;
//      a mismatch silently kills editability — cheap insurance).
//    • Aggregates are computed by "painting" each record's span onto column
//      arrays once — O(records × span) instead of O(columns × records) scans.
//      Column lookup is binary search. Utleide now also gets a summary total
//      (v1 left that header row blank).
//    • All appfarm.actions calls use the optional-chained pattern
//      appfarm.actions?.name?.(params[, { event }]).
//    • Removed dead code: saveFocusKey/loadFocusKey, setupArrowNavigation,
//      and the unused viewGranularity read (this view is week-only).
//
//  Changes in v2.1:
//    • No client-side overlap blocking: split/merge of overlapping periods is
//      handled by the createProjectRequirement action in Appfarm. The script
//      always fires the save; hasOverlap/showOverlapWarning are removed.
//    • Collapse chevron direction fixed (expanded = up, collapsed = down).
//    • Empty-track hint text is now per-source via data-hint attribute
//      ("Dra for å registrere innleide" etc.) — pair with the updated CSS.
//    • Requirement records with invalid dates are skipped at index time with a
//      console warning listing their _id, instead of rendering invisibly and
//      blocking the row (the "Overlapper" false positive / missing hint bug).
// =============================================================================

// NOTE: Do NOT add a 'use strict' directive here. Appfarm wraps coded-component
// scripts in a generated function with a non-simple parameter list, and a
// 'use strict' directive in that position is a SyntaxError that breaks the
// entire generated functions bundle (every function value in the app).

// ═══ 1. CONFIG ════════════════════════════════════════════════════════════
const SRC = { BEHOV: 10, EGNE: 20, INNLEIDE: 30, UTLEIDE: 35, UDEKT: 40, OVERSKUDD: 50 };

const SOURCE_CLASS = {
    [SRC.BEHOV]:     'behov',
    [SRC.EGNE]:      'egne',
    [SRC.INNLEIDE]:  'innleide',
    [SRC.UTLEIDE]:   'utleide',
    [SRC.UDEKT]:     'udekt',
    [SRC.OVERSKUDD]: 'overskudd'
};

const EDITABLE_SOURCES = new Set([SRC.BEHOV, SRC.INNLEIDE, SRC.UTLEIDE]); // user draws bars / sources stored as spans
const STATUS_SOURCES   = new Set([SRC.UDEKT, SRC.OVERSKUDD]);             // gap rows — drive the rp-row-status styling
// Fixed source row order under each work-type band: EDITABLE sources first
// (Behov, Innleide, Utleide — what the user draws), then the computed/read-only
// rows (Egne, Udekt, Overskudd). The split is the primary parse cue — the
// editable working surface sits at the top, the recessive computed zone below
// (see .rp-row-derived muting in the CSS). Order within each group is enum value.
const SOURCE_ORDER = [SRC.BEHOV, SRC.INNLEIDE, SRC.UTLEIDE, SRC.EGNE, SRC.UDEKT, SRC.OVERSKUDD];

// Marketplace tier priority (internt → partnere → alle). Ads arrive pre-tagged with
// `tier` (1/2/3) from Appfarm — the component never resolves partnerships itself.
// Lower tier wins (shown first / used for the marker colour).
const TIER_LABEL = { 1: 'internt', 2: 'partner', 3: 'alle' };
const TIER_MAX   = 9;   // unknown/untagged ad sinks below 'alle'

const STICKY_W          = 280;   // left panel width (px) — keep in sync with CSS --rp-sticky-w
const DEFAULT_COL_W     = 60;
const FALLBACK_WEEKS    = 20;    // window when viewFrom/viewTo are unset
const CAL_YEAR_BACK     = 2;     // period-picker year grid spans seed−BACK .. seed+FWD
const CAL_YEAR_FWD      = 6;     // FWD ≥ 2y future range from any seed
const DAY_MS            = 86400000;
const DRAG_THRESHOLD_PX = 4;     // movement below this = click, not drag

const ICONS = {
    chevronDown: '<svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 4l4 4 4-4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>',
    chevronUp:   '<svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 8l4-4 4 4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>',
    edit:        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
    graph:       '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 17V13M12 17V9M16 17V13"/></svg>',
    tag:         '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.83z"/><circle cx="7" cy="7" r="1"/></svg>'
};

// ═══ 2. UTILITIES ═══════════════════════════════════════════════════════════
const safeGet   = (ds) => ds?.get?.() || [];
const resolveId = (ref) => (ref && typeof ref === 'object' ? ref._id : ref);
const toInt     = (v) => { const n = parseInt(v, 10); return Number.isNaN(n) ? null : n; };
// Display name of a referenced object (Company etc.) however Appfarm hands it over:
// a flat string field, an expanded object, or a display value. Falls back gracefully.
const refName   = (ref) => {
    if (ref == null) return '';
    if (typeof ref === 'string') return ref;
    return ref.name || ref.label || ref._displayValue || ref.fullName || '';
};
const clampIdx  = (i) => Math.max(0, Math.min(columns.length - 1, i));

// Appfarm actions are invoked directly with optional chaining, e.g.
//   appfarm.actions?.updateProjectRequirement?.({ ... });
// UI actions triggered by clicks also pass the event: fn(params, { event: e })

function startOfDay(d)  { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d)    { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function addDays(d, n)  { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function startOfWeekMon(d) {
    const x = startOfDay(d);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
}
function endOfWeekMon(d) { return endOfDay(addDays(startOfWeekMon(d), 6)); }
function fmtDayMonth(d) {
    const x = new Date(d);
    return String(x.getDate()).padStart(2, '0') + '.' + String(x.getMonth() + 1).padStart(2, '0');
}
function fmtDate(d) { return fmtDayMonth(d) + '.' + new Date(d).getFullYear(); }

function getISOWeek(d) {
    const t = startOfDay(d);
    t.setDate(t.getDate() - ((t.getDay() + 6) % 7) + 3);
    const jan4 = new Date(t.getFullYear(), 0, 4);
    return 1 + Math.round((+t - +jan4) / 604800000);
}
function getISOWeekYear(d) {
    const t = startOfDay(d);
    t.setDate(t.getDate() - ((t.getDay() + 6) % 7) + 3);
    return t.getFullYear();
}

// ═══ 3. STATE ═══════════════════════════════════════════════════════════════
let columns    = [];     // [{ index, start, end, left, width, label, topLabel, topYear }]
let gridWidth  = 0;
let rangeStart = null;
let rangeEnd   = null;
let COL_W      = DEFAULT_COL_W;

let reqById         = new Map(); // _id → requirement record
let reqsByKey       = new Map(); // reqKey() → [record] sorted by dateFrom
let allocsByProject = new Map(); // projectId → [allocation]
let absentByCol     = [];        // column index → Set<resourceId> absent that week
let wtNameMap       = {};        // workType enum_value → enum_name
let jobsByWT        = new Map(); // workType → [Job ad]               (lease-OUT demand; surplus weeks)
let availByWT       = new Map(); // workType → [Resource Available ad] (lease-IN supply; deficit weeks)

let activeDrag    = null;
let liftedBar     = null;        // editable span currently lifted by lane-hover
let popoverEl     = null;
let tooltipEl     = null;
let activeEdit    = false;       // popover open → block rebuilds
let rebuildQueued = false;       // a change arrived while blocked → flush later

const reqKey = (projectId, source, workType) => projectId + ':' + source + ':' + workType;

// ═══ 4. TIME AXIS & GEOMETRY ════════════════════════════════════════════════
function buildColumns() {
    COL_W = toInt(appfarm.data.calendarWeekWidthPixel?.get?.()) || DEFAULT_COL_W;

    const vf = appfarm.data.viewFrom?.get?.();
    const vt = appfarm.data.viewTo?.get?.();
    rangeStart = startOfWeekMon(vf ? new Date(vf) : new Date());
    rangeEnd   = vt ? endOfWeekMon(new Date(vt))
                    : endOfWeekMon(addDays(rangeStart, 7 * FALLBACK_WEEKS));

    columns   = [];
    gridWidth = 0;
    let cur = new Date(rangeStart);
    while (+cur <= +rangeEnd) {
        const wEnd = endOfWeekMon(cur);
        columns.push({
            start:    new Date(cur),
            end:      wEnd,
            left:     gridWidth,
            width:    COL_W,
            label:    String(getISOWeek(cur)),
            topLabel: new Date(2000, cur.getMonth()).toLocaleString('nb-NO', { month: 'short' }),
            topYear:  getISOWeekYear(cur)
        });
        gridWidth += COL_W;
        // startOfDay: addDays(wEnd,1) inherits wEnd's 23:59:59.999 time; using it
        // as the next column's start opens a ~24h dead zone where colIndexForDate
        // finds no column and bars snap to gridWidth. Normalize to midnight.
        cur = startOfDay(addDays(wEnd, 1));
    }
}

/** Binary search: column index containing date d.
 *  Returns -1 (before window) or columns.length (after window) when outside. */
function colIndexForDate(d) {
    const t = +d;
    let lo = 0, hi = columns.length - 1;
    while (lo <= hi) {
        const m = (lo + hi) >> 1;
        if (t < +columns[m].start)    hi = m - 1;
        else if (t > +columns[m].end) lo = m + 1;
        else return m;
    }
    return t < +columns[0]?.start ? -1 : columns.length;
}

function xForDate(d) {
    const i = colIndexForDate(d);
    if (i < 0) return 0;
    if (i >= columns.length) return gridWidth;
    const c = columns[i];
    return c.left + ((+d - +c.start) / (+c.end - +c.start)) * c.width;
}

function colIdxFromClientX(clientX, trackRect) {
    return clampIdx(Math.floor((clientX - trackRect.left) / COL_W));
}

// ═══ 5. DATA INDEXING ═══════════════════════════════════════════════════════
function indexData() {
    wtNameMap = {};
    safeGet(appfarm.data.workTypeEnum).forEach(item => {
        const v = toInt(item?.enum_value);
        if (v != null) wtNameMap[v] = item.enum_name || String(v);
    });

    reqById   = new Map();
    reqsByKey = new Map();
    safeGet(appfarm.data.projectRequirements).forEach(r => {
        reqById.set(r._id, r);
        // Records with unparsable dates would render invisibly, eat the
        // empty-track hint, and confuse aggregates — surface them instead.
        if (isNaN(+new Date(r.dateFrom)) || isNaN(+new Date(r.dateTo))) {
            console.warn('[req-planner] Requirement with invalid dates skipped — '
                + 'clean up this record in Appfarm:', r._id, r);
            return;
        }
        const key = reqKey(resolveId(r.project), toInt(r.source), toInt(r.workType));
        let list = reqsByKey.get(key);
        if (!list) reqsByKey.set(key, (list = []));
        list.push(r);
    });
    reqsByKey.forEach(list =>
        list.sort((a, b) => +new Date(a.dateFrom) - +new Date(b.dateFrom)));

    allocsByProject = new Map();
    safeGet(appfarm.data.allocation).forEach(a => {
        const projId = resolveId(a.project);
        if (!projId) return;
        let list = allocsByProject.get(projId);
        if (!list) allocsByProject.set(projId, (list = []));
        list.push(a);
    });

    // Absence is person-global (no project/workType): paint each absent resource
    // onto every column its span overlaps, so Egne can exclude them per week.
    // Built once here (columns exist — buildColumns runs before indexData).
    absentByCol = Array.from({ length: columns.length }, () => new Set());
    safeGet(appfarm.data.absence).forEach(ab => {
        const rid = resolveId(ab.resource);
        if (rid == null) return;
        const from = startOfDay(new Date(ab.dateFrom));
        const to   = endOfDay(new Date(ab.dateTo));
        if (isNaN(+from) || isNaN(+to)) return;
        if (+to < +rangeStart || +from > +rangeEnd) return;
        const s = clampIdx(colIndexForDate(from));
        const e = clampIdx(colIndexForDate(to));
        for (let i = s; i <= e; i++) absentByCol[i].add(rid);
    });

    // Marketplace ads, bucketed by work type so a band column can surface matching
    // availability. Each record is expected to carry a pre-computed `tier` (1/2/3).
    jobsByWT  = bucketAdsByWT(appfarm.data.jobs);                // lease-OUT (surplus → oppdrag)
    availByWT = bucketAdsByWT(appfarm.data.resourcesAvailable);  // lease-IN  (deficit → ledige)
}

// Bucket an ad data source (Job ad / Resource Available ad) by work type, dropping
// records with no work type or unparsable dates. Mirrors assignment-grid's jobsByWorkType.
function bucketAdsByWT(ds) {
    const map = new Map();
    safeGet(ds).forEach(ad => {
        const wt = toInt(ad.workType);
        if (wt == null) return;
        if (isNaN(+new Date(ad.dateStart)) || isNaN(+new Date(ad.dateEnd))) return;
        let list = map.get(wt);
        if (!list) map.set(wt, (list = []));
        list.push(ad);
    });
    return map;
}

// Raw marketplace ads overlapping band columns ci..cj. dir 'in' = lease in (deficit →
// Resource Available ads), 'out' = lease out (surplus → Job ads). Sorted best-tier-first.
function adsForRange(wt, ci, cj, dir) {
    const list = (dir === 'in' ? availByWT : jobsByWT).get(wt) || [];
    const cs = +columns[ci].start, ce = +columns[cj].end;
    return list
        .filter(ad => +new Date(ad.dateEnd) >= cs && +new Date(ad.dateStart) <= ce)
        .sort((a, b) => (toInt(a.tier) || TIER_MAX) - (toInt(b.tier) || TIER_MAX));
}

// ═══ 6. AGGREGATES ══════════════════════════════════════════════════════════
//  Egne      = distinct allocated persons on this project overlapping the
//              column's week, minus any resource absent that week
//  Udekt     = max(0, Behov − Egne − Innleide)
//  Overskudd = max(0, Egne + Innleide − Behov)
//
//  Each record's span is painted onto a per-(source, workType) column array
//  exactly once. The work-type band reads its coverage state from gap() below.
function computeAggregates(projectId, workTypes) {
    const N      = columns.length;
    const detail = new Map(); // `${src}_${wt}` → number[N]
    const detailArr = (src, wt) => {
        const k = src + '_' + wt;
        let a = detail.get(k);
        if (!a) detail.set(k, (a = new Array(N).fill(0)));
        return a;
    };

    // Behov *presence* per work type — 1 on every column a Behov record overlaps,
    // independent of its resourceCount. This is what separates "covered (gap 0)"
    // from "no demand registered" (project ended / not started / not filled in):
    // a registered Behov of 0 still counts as present, a missing record does not.
    const behovPresent = new Map(); // wt → number[N] (0/1)
    const presentArr = (wt) => {
        let a = behovPresent.get(wt);
        if (!a) behovPresent.set(wt, (a = new Array(N).fill(0)));
        return a;
    };

    function paintSpan(fromRaw, toRaw, onCol) {
        const from = startOfDay(new Date(fromRaw));
        const to   = endOfDay(new Date(toRaw));
        if (isNaN(+from) || isNaN(+to)) return;
        if (+to < +rangeStart || +from > +rangeEnd) return;
        const s = clampIdx(colIndexForDate(from));
        const e = clampIdx(colIndexForDate(to));
        for (let i = s; i <= e; i++) onCol(i);
    }
    function paint(arr, fromRaw, toRaw, val) {
        if (!val) return;
        paintSpan(fromRaw, toRaw, i => { arr[i] += val; });
    }

    // Requirement bars (Behov / Innleide / Utleide)
    workTypes.forEach(wt => {
        [...EDITABLE_SOURCES].forEach(src => {
            (reqsByKey.get(reqKey(projectId, src, wt)) || []).forEach(r => {
                paint(detailArr(src, wt), r.dateFrom, r.dateTo, r.resourceCount || 0);
                if (src === SRC.BEHOV)
                    paintSpan(r.dateFrom, r.dateTo, i => { presentArr(wt)[i] = 1; });
            });
        });
    });

    // Egne = distinct allocated persons PRESENT (not absent) per work type/column.
    // Count distinct resources (not allocation rows) and drop anyone absent that week.
    const egneSets = new Map(); // wt → Array<Set>(N) — per-work-type detail rows
    const egneSetFor = (wt) => {
        let a = egneSets.get(wt);
        if (!a) egneSets.set(wt, (a = Array.from({ length: N }, () => new Set())));
        return a;
    };
    // Each allocation carries the resource's own trade (workType), independent of the
    // work types the project lists as needed. Place each present person into the row of
    // their own trade — exactly one row, never duplicated. A trade the project didn't
    // list as needed still gets a row (rendered as an "exception" below), so off-trade
    // own people are never silently dropped. EGNE header = sum across all trades; since
    // every person sits in exactly one row, sum == distinct persons present.
    (allocsByProject.get(projectId) || []).forEach(a => {
        const rid = resolveId(a.resource);
        if (rid == null) return;
        const aWt = toInt(a.workType);
        if (aWt === null) return;                                      // no trade → can't place
        const from = startOfDay(new Date(a.dateFrom));
        const to   = endOfDay(new Date(a.dateTo));
        if (isNaN(+from) || isNaN(+to)) return;
        if (+to < +rangeStart || +from > +rangeEnd) return;
        const s = clampIdx(colIndexForDate(from));
        const e = clampIdx(colIndexForDate(to));
        const sets = egneSetFor(aWt);
        for (let i = s; i <= e; i++) {
            if (absentByCol[i] && absentByCol[i].has(rid)) continue;   // present only
            sets[i].add(rid);
        }
    });
    // Trades present among own people but NOT listed as a project need — rendered as
    // extra "exception" Egne rows. Sorted for stable row order.
    const egneExtraWTs = [...egneSets.keys()]
        .filter(wt => !workTypes.includes(wt))
        .sort((a, b) => a - b);
    [...workTypes, ...egneExtraWTs].forEach(wt => {
        const egne = detailArr(SRC.EGNE, wt);
        const sets = egneSetFor(wt);
        for (let i = 0; i < N; i++) egne[i] = sets[i].size;
    });

    // Derive Udekt / Overskudd per work type per column
    workTypes.forEach(wt => {
        const behov = detailArr(SRC.BEHOV, wt);
        const egne  = detailArr(SRC.EGNE, wt);
        const inn   = detailArr(SRC.INNLEIDE, wt);
        const udekt = detailArr(SRC.UDEKT, wt);
        const ovsk  = detailArr(SRC.OVERSKUDD, wt);
        for (let i = 0; i < N; i++) {
            const diff = behov[i] - egne[i] - inn[i];
            udekt[i] = Math.max(0, diff);
            ovsk[i]  = Math.max(0, -diff);
        }
    });

    // Coverage balance for the work-type band: bal = Egne + Innleide − Behov
    // (Utleide is lease-out, not coverage). The displayed number is the balance, so
    // surplus reads +N and deficit −N. Four states the band renders distinctly:
    //   none     — no Behov record this column → unplanned, shown without a number
    //   deficit  — short of demand (bal < 0, Udekt)     → warm underline, shows −N
    //   surplus  — over demand     (bal > 0, Overskudd) → cool underline, shows +N
    //   covered  — bal == 0 with Behov present          → calm 0
    const gapAt = (wt, i) => {
        if (!behovPresent.get(wt)?.[i]) return { state: 'none', value: 0 };
        const bal = (detail.get(SRC.EGNE + '_' + wt)?.[i]     || 0)
                  + (detail.get(SRC.INNLEIDE + '_' + wt)?.[i] || 0)
                  - (detail.get(SRC.BEHOV + '_' + wt)?.[i]    || 0);
        if (bal < 0) return { state: 'deficit', value: bal };   // −N
        if (bal > 0) return { state: 'surplus', value: bal };   // +N
        return { state: 'covered', value: 0 };
    };

    return {
        egneExtraWTs,
        detail: (src, wt, i) => detail.get(src + '_' + wt)?.[i] || 0,
        gap:    gapAt
    };
}

// ═══ 7. RENDERING ═══════════════════════════════════════════════════════════
function makeBar(rec, srcClass) {
    const from  = startOfDay(new Date(rec.dateFrom));
    const to    = endOfDay(new Date(rec.dateTo));
    const left  = xForDate(from);
    const right = xForDate(to);
    const clipL = +from < +rangeStart;
    const clipR = +to   > +rangeEnd;

    const bar = document.createElement('div');
    bar.className = 'rp-bar rp-bar-' + srcClass
        + (clipL ? ' rp-clip-l' : '') + (clipR ? ' rp-clip-r' : '');
    bar.style.left  = left + 'px';
    bar.style.width = Math.max(right - left, COL_W) + 'px';
    bar.dataset.reqId = rec._id;
    bar.innerHTML =
        (clipL ? '' : '<span class="rp-handle" data-edge="l"></span>') +
        '<span class="rp-bar-count">' + (rec.resourceCount ?? 0) + '</span>' +
        (clipR ? '' : '<span class="rp-handle" data-edge="r"></span>');
    return bar;
}

function makeEditableTrack(projectId, srcEnum, srcClass, workType, srcName) {
    const track = document.createElement('div');
    track.className = 'rp-track rp-track-editable';
    track.dataset.projectId = projectId;
    track.dataset.source    = srcEnum;
    track.dataset.workType  = workType;
    track.dataset.hint      = 'Dra for å registrere ' + (srcName || 'behov').toLowerCase();
    track.style.width          = gridWidth + 'px';
    track.style.backgroundSize = COL_W + 'px 100%';
    (reqsByKey.get(reqKey(projectId, srcEnum, workType)) || [])
        // Drop records that don't overlap the visible window. Otherwise makeBar
        // clamps both edges to gridWidth (width 0) and its Math.max(_, COL_W)
        // floor plants a phantom column-wide bar just past the grid's right edge.
        // Mirrors the overlap guard the derived rows already get via paintSpan.
        .filter(r => +endOfDay(new Date(r.dateTo))   >= +rangeStart
                  && +startOfDay(new Date(r.dateFrom)) <= +rangeEnd)
        .forEach((r, idx) => {
            const bar = makeBar(r, srcClass);
            if (idx % 2) bar.classList.add('rp-bar-alt');   // alternate-shade spans
            track.appendChild(bar);
        });
    return track;
}

// Aggregate (read-only) detail rows render as bars: collapse adjacent equal
// values into one bar (no handles) with the value shown once; 0 columns are left
// as blank gaps. The source class carries the row identity (CSS hatch + tick).
function makeRunBarTrack(values, srcClass) {
    const track = document.createElement('div');
    track.className = 'rp-track rp-track-agg';
    track.style.width          = gridWidth + 'px';
    track.style.backgroundSize = COL_W + 'px 100%';
    let i = 0, runIdx = 0;
    while (i < values.length) {
        const v = values[i];
        if (!v) { i++; continue; }                                   // 0 → gap
        let j = i;
        while (j + 1 < values.length && values[j + 1] === v) j++;    // extend run
        const left = columns[i].left;
        const bar = document.createElement('div');
        bar.className = 'rp-bar rp-bar-agg rp-bar-' + srcClass
            + (runIdx % 2 ? ' rp-bar-alt' : '');                     // alternate-shade spans
        bar.style.left  = left + 'px';
        bar.style.width = (columns[j].left + columns[j].width - left) + 'px';
        bar.innerHTML = '<span class="rp-bar-count">' + v + '</span>';
        track.appendChild(bar);
        i = j + 1;
        runIdx++;
    }
    return track;
}

function makeDerivedTrack(agg, srcEnum, workType) {
    const values = columns.map((_, ci) => agg.detail(srcEnum, workType, ci));
    return makeRunBarTrack(values, SOURCE_CLASS[srcEnum] || 'behov');
}

// Magnitude bucket for the gap band's intensity ramp (CSS deepens the fill by
// data-mag, so severity is scannable without reading the digit): 1 · 2–3 · 4+.
const magBucket = (v) => { const a = Math.abs(v); return a <= 1 ? '1' : a <= 3 ? '2' : '3'; };

// The work-type coverage band: one run-bar per contiguous (state,value) run.
// Unlike makeRunBarTrack this keys on the gap STATE, so a stretch of unplanned
// weeks ('none') renders as one continuous number-less block instead of gaps,
// and covered/deficit/surplus never merge across a state change.
function makeGapBandTrack(agg, wtId) {
    const track = document.createElement('div');
    track.className = 'rp-track rp-track-agg rp-track-gap';
    track.style.width          = gridWidth + 'px';
    track.style.backgroundSize = COL_W + 'px 100%';

    const states = columns.map((_, ci) => agg.gap(wtId, ci));
    let i = 0;
    while (i < states.length) {
        const g = states[i];
        let j = i;
        while (j + 1 < states.length
            && states[j + 1].state === g.state
            && states[j + 1].value === g.value) j++;
        const left = columns[i].left;
        const bar = document.createElement('div');
        bar.className = 'rp-bar rp-bar-agg rp-gap rp-gap-' + g.state;
        bar.style.left  = left + 'px';
        bar.style.width = (columns[j].left + columns[j].width - left) + 'px';
        if (g.state === 'deficit' || g.state === 'surplus') bar.dataset.mag = magBucket(g.value);
        if (g.state !== 'none') {                                           // 'none' = no number
            const txt = g.value > 0 ? '+' + g.value : String(g.value);     // +N surplus, −N deficit, 0 covered
            bar.innerHTML = '<span class="rp-bar-count">' + txt + '</span>';
        }
        // Marketplace indicator beside the number: deficit → lease-in supply (Resource
        // Available ads), surplus → lease-out demand (Job ads). One icon per run bar,
        // aggregating ads across the run's columns; per-ad date ranges live in the popover.
        const dir = g.state === 'deficit' ? 'in' : g.state === 'surplus' ? 'out' : null;
        if (dir) {
            const ads = adsForRange(wtId, i, j, dir);
            if (ads.length)
                bar.querySelector('.rp-bar-count').appendChild(makeAdsIndicator(ads, dir, wtId));
        }
        track.appendChild(bar);
        i = j + 1;
    }
    return track;
}

// Icon next to the gap number: click opens the ads popover for this run.
function makeAdsIndicator(ads, dir, wtId) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'rp-ads-btn rp-ads-btn-' + dir;
    el.innerHTML = ICONS.tag;                       // direction lives in the title + popover
    el.title = adsVerb(dir) + ' (' + ads.length + ')';
    el.addEventListener('click', (e) => {
        e.stopPropagation();
        showAdsPopover({ anchorX: e.clientX, anchorY: e.clientY, ads, dir, wtId });
    });
    return el;
}

function adsVerb(dir) {
    return dir === 'in' ? 'Ledige ressurser å leie inn' : 'Oppdrag å leie ut til';
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Work-type band row — the dominant grouping level, replacing the old source
// summary header. Carries the only saturated colour in the grid (the gap band);
// everything beneath it is monochrome ink.
function makeWorkTypeBandRow(project, wtId, agg, isException) {
    const row = document.createElement('div');
    row.className = 'rp-row rp-row-wt-band' + (isException ? ' rp-row-exception' : '');
    row.style.setProperty('--proj-color', project.colorHexCode || '#d1eae0');

    const label = document.createElement('div');
    label.className = 'rp-label-cell rp-wt-band-label';
    label.textContent = (wtNameMap[wtId] || String(wtId)) + (isException ? ' ⚠' : '');
    if (isException) label.title = 'Ikke planlagt arbeidstype på dette prosjektet';

    row.appendChild(label);
    row.appendChild(makeGapBandTrack(agg, wtId));
    return row;
}

function makeActionButton(icon, title, onClick) {
    const btn = document.createElement('button');
    btn.className = 'rp-action-btn';
    btn.innerHTML = icon;
    btn.title = title;
    btn.addEventListener('click', onClick);
    return btn;
}

function makeGroupHeader(project, showDetails) {
    const projectId = project._id;
    const color     = project.colorHexCode || '#d1eae0';

    const row = document.createElement('div');
    row.className = 'rp-group-head';
    row.style.width = (STICKY_W + gridWidth) + 'px';
    row.style.setProperty('--proj-color', color);   // left stripe + muted-tint base (CSS)

    const inner = document.createElement('div');
    inner.className = 'rp-group-label';

    const collapseBtn = makeActionButton(
        showDetails ? ICONS.chevronUp : ICONS.chevronDown,
        showDetails ? 'Skjul detaljer' : 'Vis detaljer',
        e => appfarm.actions?.toggleDetails?.({ projectId }, { event: e }));
    collapseBtn.classList.add('rp-collapse-btn');
    inner.appendChild(collapseBtn);

    inner.appendChild(makeActionButton(ICONS.edit, 'Rediger prosjekt',
        e => appfarm.actions?.editProject?.({ projectId }, { event: e })));
    inner.appendChild(makeActionButton(ICONS.graph, 'Vis graf',
        e => appfarm.actions?.openGraph?.({ projectId }, { event: e })));

    const nameSpan = document.createElement('span');
    nameSpan.className = 'rp-project-name';
    nameSpan.textContent = project.name || 'Prosjekt';
    inner.appendChild(nameSpan);

    row.appendChild(inner);
    return row;
}

function buildHeader(inner) {
    const header = document.createElement('div');
    header.className = 'rp-header';

    const corner = document.createElement('div');
    corner.className = 'rp-corner';
    header.appendChild(corner);

    const axis = document.createElement('div');
    axis.className = 'rp-axis';
    axis.style.width = gridWidth + 'px';

    // Month grouping row
    const monthsRow = document.createElement('div');
    monthsRow.className = 'rp-months';
    let g = null;
    columns.forEach(c => {
        if (!g || g.topLabel !== c.topLabel || g.topYear !== c.topYear) {
            const cell = document.createElement('div');
            cell.className = 'rp-month';
            cell.textContent = c.topLabel + " '" + String(c.topYear).slice(-2);
            g = { topLabel: c.topLabel, topYear: c.topYear, n: 0, el: cell };
            monthsRow.appendChild(cell);
        }
        g.n++;
        g.el.style.width = (g.n * COL_W) + 'px';
    });

    // Week-number row
    const colRow = document.createElement('div');
    colRow.className = 'rp-cols';
    const today = new Date();
    columns.forEach(c => {
        const cell = document.createElement('div');
        cell.className = 'rp-col';
        cell.style.width = c.width + 'px';
        cell.textContent = c.label;
        if (today >= c.start && today <= c.end) cell.classList.add('current');
        colRow.appendChild(cell);
    });

    axis.appendChild(monthsRow);
    axis.appendChild(colRow);
    header.appendChild(axis);
    inner.appendChild(header);
}

function renderNowLine(inner) {
    const today = new Date();
    if (!rangeStart || !rangeEnd || today < rangeStart || today > rangeEnd) return;
    const line = document.createElement('div');
    line.className = 'rp-nowline';
    line.style.left = (STICKY_W + xForDate(today)) + 'px';
    inner.appendChild(line);
}

function buildAll() {
    const inner = document.getElementById('rp-inner');
    if (!inner) return;

    buildColumns();
    indexData();
    inner.innerHTML = '';
    liftedBar = null;                 // DOM is recreated — drop the stale ref
    buildHeader(inner);

    const allProjects  = safeGet(appfarm.data.projects);
    const allSources   = safeGet(appfarm.data.source);
    const allWorkTypes = safeGet(appfarm.data.projectWorkType);
    const frag         = document.createDocumentFragment();

    allProjects.forEach(project => {
        const projectId   = project._id;
        const showDetails = !!project.detailsShowBOL;
        const projColor   = project.colorHexCode || '#d1eae0';   // left stripe + bottom line

        const projectWTs = allWorkTypes
            .filter(wt => resolveId(wt.project) === projectId)
            .map(wt => toInt(wt.workType))
            .filter(wt => wt != null);

        const agg = computeAggregates(projectId, projectWTs);

        frag.appendChild(makeGroupHeader(project, showDetails));

        // Full-width line in the project colour directly under the title row —
        // marks the project across the whole timeline (scrolls with the grid).
        const sep = document.createElement('div');
        sep.className = 'rp-group-sep';
        sep.style.width = (STICKY_W + gridWidth) + 'px';
        sep.style.setProperty('--proj-color', projColor);
        frag.appendChild(sep);

        // Work-type-first: project → role (work type) → its source rows. The gap
        // band always renders; the six source detail rows only when expanded.
        const srcNameByEnum = {};
        allSources.forEach(s => {
            const e = toInt(s.enum_value);
            if (e != null) srcNameByEnum[e] = s.enum_name || '';
        });

        const extraWTs = agg.egneExtraWTs || [];
        [...projectWTs, ...extraWTs].forEach(wtId => {
            const isException = extraWTs.includes(wtId);
            frag.appendChild(makeWorkTypeBandRow(project, wtId, agg, isException));
            if (!showDetails) return;                        // collapsed = bands only

            SOURCE_ORDER.forEach(srcEnum => {
                const srcClass   = SOURCE_CLASS[srcEnum] || 'behov';
                // Exception trades are read-only: the project never planned this
                // work type, so its requirement sources can't be drawn/edited.
                const isEditable = EDITABLE_SOURCES.has(srcEnum) && !isException;
                const isStatus   = STATUS_SOURCES.has(srcEnum);

                const row = document.createElement('div');
                row.style.setProperty('--proj-color', projColor);
                row.className = 'rp-row rp-row-src rp-row-src-' + srcClass
                    + (isEditable ? ' rp-row-editable' : ' rp-row-derived')
                    + (isStatus ? ' rp-row-status' : '');

                const label = document.createElement('div');
                label.className = 'rp-label-cell rp-source-label rp-source-label-' + srcClass;
                label.textContent = srcNameByEnum[srcEnum] || srcClass;
                row.appendChild(label);

                const track = isEditable
                    ? makeEditableTrack(projectId, srcEnum, srcClass, wtId, srcNameByEnum[srcEnum])
                    : makeDerivedTrack(agg, srcEnum, wtId);
                row.appendChild(track);
                frag.appendChild(row);
            });
        });
    });

    inner.appendChild(frag);
    renderNowLine(inner);
}

// Rebuilds are queued — never dropped — while the user is mid-edit or mid-drag,
// then flushed as soon as the interaction ends.
function guardedBuildAll() {
    if (activeEdit || activeDrag) { rebuildQueued = true; return; }
    buildAll();
}
function flushQueuedRebuild() {
    if (rebuildQueued && !activeEdit && !activeDrag) {
        rebuildQueued = false;
        buildAll();
    }
}

// ═══ 8. count POPOVER ════════════════════════════════════════════════════
//  Anchored to the cursor, input focused immediately.
//  Enter = confirm · Esc / click-outside = cancel · optional Slett = delete.
//  While open, activeEdit blocks rebuilds so the pending ghost survives.
function showCountPopover(opts) {
    // opts: { anchorX, anchorY, defaultCount, dateFrom, dateTo, onConfirm, onCancel?, onDelete? }
    //   onConfirm(count, dateFromISO, dateToISO)
    removePopover();
    activeEdit = true;

    const showDelete = typeof opts.onDelete === 'function'
        && typeof appfarm.actions?.deleteProjectRequirement === 'function';

    // Calendar state — exact-day precision, one calendar surface that edits
    // whichever end (`open`) is active; each end keeps its own month view.
    const seedFrom = opts.dateFrom ? new Date(opts.dateFrom) : new Date();
    const calState = {
        from:     opts.dateFrom ? startOfDay(new Date(opts.dateFrom)) : null,
        to:       opts.dateTo   ? startOfDay(new Date(opts.dateTo))   : null,
        open:     'from',
        viewFrom: startOfDay(opts.dateFrom ? new Date(opts.dateFrom) : seedFrom),
        viewTo:   startOfDay(opts.dateTo ? new Date(opts.dateTo)
                           : opts.dateFrom ? new Date(opts.dateFrom) : seedFrom)
    };

    // Line-style icons (stroke, currentColor) matching the component's iconography.
    const CAL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M16 2v4M8 2v4M3 10h18"></path></svg>';
    const TRASH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M10 11v6M14 11v6"></path></svg>';

    popoverEl = document.createElement('div');
    popoverEl.className = 'rp-popover rp-popover-wide';
    popoverEl.innerHTML =
        '<div class="rp-popover-title">Antall ressurser</div>' +
        '<input class="rp-popover-input" type="number" min="0" step="1" value="' + (opts.defaultCount ?? 1) + '" />' +
        '<div class="rp-popover-datefields">' +
            '<span class="rp-datefield" data-end="from"><span class="rp-df-label">Fra dato</span>' +
                '<span class="rp-df-val rp-chip-from">–</span><span class="rp-df-cal">' + CAL_ICON + '</span></span>' +
            '<span class="rp-datefield" data-end="to"><span class="rp-df-label">Til dato</span>' +
                '<span class="rp-df-val rp-chip-to">–</span><span class="rp-df-cal">' + CAL_ICON + '</span></span>' +
        '</div>' +
        '<div class="rp-datepop"></div>' +
        '<div class="rp-popover-actions">' +
            (showDelete ? '<button type="button" class="rp-popover-delete">' + TRASH_ICON + '<span>Slett</span></button>' : '') +
            '<button class="rp-popover-confirm">Lagre</button>' +
        '</div>';
    document.body.appendChild(popoverEl);

    // Position: prefer right of cursor, flip left near the window edge, and clamp
    // into the viewport (re-callable so the collapsible calendar can't push it off).
    function placePopover() {
        const pw = popoverEl.offsetWidth  || 280;
        const ph = popoverEl.offsetHeight || 360;
        const M = 8;
        let left = opts.anchorX + 10;
        if (left + pw > window.innerWidth - M) left = opts.anchorX - pw - 10;
        let top = opts.anchorY - 16;
        if (top + ph > window.innerHeight - M) top = window.innerHeight - ph - M;
        popoverEl.style.left = Math.max(M, left) + 'px';
        popoverEl.style.top  = Math.max(M, top) + 'px';
    }

    const input = /** @type {HTMLInputElement} */ (popoverEl.querySelector('.rp-popover-input'));

    // Fra/Til fields open a collapsible calendar that edits the active end (`open`).
    const chipFrom   = popoverEl.querySelector('.rp-chip-from');
    const chipTo     = popoverEl.querySelector('.rp-chip-to');
    const fieldFrom  = popoverEl.querySelector('.rp-datefield[data-end="from"]');
    const fieldTo    = popoverEl.querySelector('.rp-datefield[data-end="to"]');
    const calMount   = popoverEl.querySelector('.rp-datepop');
    let calOpen = false;
    function updateChips() {
        chipFrom.textContent = calState.from ? fmtDate(calState.from) : '–';
        chipTo.textContent   = calState.to   ? fmtDate(calState.to)   : '–';
        fieldFrom.classList.toggle('active', calOpen && calState.open === 'from');
        fieldTo.classList.toggle('active', calOpen && calState.open === 'to');
    }
    function renderCalendar() {
        const isFrom = calState.open === 'from';
        renderDayPicker(calMount, {
            selected: isFrom ? calState.from : calState.to,
            view:     isFrom ? calState.viewFrom : calState.viewTo,
            onPickDay(day) {
                const d = startOfDay(day);
                if (isFrom) {
                    calState.from = d;
                    if (calState.to && +calState.to < +d) calState.to = d;
                } else {
                    calState.to = d;
                    if (calState.from && +d < +calState.from) calState.from = d;
                }
                if (isFrom) calState.viewFrom = d; else calState.viewTo = d;
                closeCal();
                updateChips();
            },
            onNavigate(viewDate) {
                if (isFrom) calState.viewFrom = viewDate; else calState.viewTo = viewDate;
            }
        });
    }
    function openCal(end) {
        calState.open = end;
        calOpen = true;
        calMount.classList.add('open');
        renderCalendar();
        updateChips();
        placePopover();   // height changed → re-clamp into viewport
    }
    function closeCal() { calOpen = false; calMount.classList.remove('open'); updateChips(); placePopover(); }
    fieldFrom.addEventListener('click', () => calOpen && calState.open === 'from' ? closeCal() : openCal('from'));
    fieldTo.addEventListener('click',   () => calOpen && calState.open === 'to'   ? closeCal() : openCal('to'));
    updateChips();
    placePopover();

    input.focus();
    input.select();

    function confirm() {
        const count = Math.max(0, parseInt(input.value, 10) || 0);
        // Exact-day precision — no week snapping. endOfDay so the bar covers the
        // full final day.
        const from = startOfDay(calState.from || seedFrom);
        let to = endOfDay(calState.to || calState.from
                       || (opts.dateTo ? new Date(opts.dateTo) : seedFrom));
        if (+to < +from) to = endOfDay(from);
        removeOutsideHandler();
        opts.onConfirm(count, from.toISOString(), to.toISOString());
        removePopover();
    }
    function cancel() {
        removeOutsideHandler();
        opts.onCancel?.();
        removePopover();
    }
    function outsideHandler(e) {
        if (popoverEl && !popoverEl.contains(e.target)) cancel();
    }
    function removeOutsideHandler() {
        document.removeEventListener('pointerdown', outsideHandler, { capture: true });
    }

    popoverEl.querySelector('.rp-popover-confirm').addEventListener('click', confirm);
    if (showDelete) {
        popoverEl.querySelector('.rp-popover-delete').addEventListener('click', () => {
            removeOutsideHandler();
            opts.onDelete();
            removePopover();
        });
    }
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter')  { e.preventDefault(); confirm(); }
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    setTimeout(() =>
        document.addEventListener('pointerdown', outsideHandler, { capture: true }), 0);
}

function removePopover() {
    if (popoverEl) { popoverEl.remove(); popoverEl = null; }
    activeEdit = false;
    flushQueuedRebuild();
}

// ═══ 8a. ADS POPOVER ═════════════════════════════════════════════════════════
//  Marketplace ads for one gap run — same shell/behaviour as the count popover
//  (cursor-anchored, Esc / click-outside closes, activeEdit blocks rebuilds).
//  Row click jumps to the ad via goToBuilderAd.
function showAdsPopover(opts) {
    // opts: { anchorX, anchorY, ads, dir ('in'|'out'), wtId }
    removePopover();
    activeEdit = true;

    popoverEl = document.createElement('div');
    popoverEl.className = 'rp-popover rp-popover-wide rp-popover-ads';
    const wtName = wtNameMap[opts.wtId] || String(opts.wtId);
    popoverEl.innerHTML =
        '<div class="rp-popover-title">' + escapeHtml(adsVerb(opts.dir) + ' · ' + wtName) + '</div>';

    opts.ads.forEach(ad => {
        const tier = toInt(ad.tier) || TIER_MAX;
        const name = ad.companyName || refName(ad.company) || 'Ukjent selskap';
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'rp-ads-row';
        row.innerHTML =
            '<span class="rp-ads-main">' +
                '<span class="rp-ads-company">' + escapeHtml(name) + '</span>' +
                '<span class="rp-ads-tier rp-tier-' + (tier <= 3 ? tier : 'x') + '">' +
                    (TIER_LABEL[tier] || '–') + '</span>' +
                '<span class="rp-ads-count">' + (Number(ad.numberOfResources) || 0) + '</span>' +
            '</span>' +
            '<span class="rp-ads-sub">' + escapeHtml(
                fmtDate(ad.dateStart) + '–' + fmtDate(ad.dateEnd) +
                (ad.title ? ' · ' + ad.title : '')) + '</span>';
        row.addEventListener('click', (e) => {
            e.stopPropagation();
            appfarm.actions?.goToBuilderAd?.(
                opts.dir === 'out' ? { jobId: ad._id } : { resourceAvailableId: ad._id },
                { event: e });
            close();
        });
        popoverEl.appendChild(row);
    });
    document.body.appendChild(popoverEl);

    // Same clamp math as the count popover's placePopover (static — no calendar here).
    const pw = popoverEl.offsetWidth || 280, ph = popoverEl.offsetHeight || 200, M = 8;
    let left = opts.anchorX + 10;
    if (left + pw > window.innerWidth - M) left = opts.anchorX - pw - 10;
    let top = opts.anchorY - 16;
    if (top + ph > window.innerHeight - M) top = window.innerHeight - ph - M;
    popoverEl.style.left = Math.max(M, left) + 'px';
    popoverEl.style.top  = Math.max(M, top) + 'px';

    function close() {
        document.removeEventListener('pointerdown', outsideHandler, { capture: true });
        document.removeEventListener('keydown', keyHandler);
        removePopover();
    }
    function outsideHandler(e) {
        if (popoverEl && !popoverEl.contains(e.target)) close();
    }
    function keyHandler(e) {
        if (e.key === 'Escape') { e.preventDefault(); close(); }
    }
    setTimeout(() => {
        document.addEventListener('pointerdown', outsideHandler, { capture: true });
        document.addEventListener('keydown', keyHandler);
    }, 0);
}

// ═══ 8b. DAY PICKER (period picker inside the popover) ═══════════════════════
//  Exact-day calendar for one end at a time. Month is stepped with ‹ ›; year is
//  jumped via a scrollable grid opened from the title. opts:
//    { selected: Date|null, view: Date(month shown),
//      onPickDay(day), onNavigate(viewDate) }
const WEEKDAY_LABELS = ['Ma', 'Ti', 'On', 'To', 'Fr', 'Lø', 'Sø'];
const MONTH_NAMES = ['januar', 'februar', 'mars', 'april', 'mai', 'juni',
    'juli', 'august', 'september', 'oktober', 'november', 'desember'];

// Pure clamp: writing one end nudges the other so from ≤ to. Exposed for demo().
function applyPick(from, to, end, day) {
    const d = startOfDay(day);
    if (end === 'from') return { from: d, to: (to && +to < +d) ? d : to };
    return { from: (from && +d < +from) ? d : from, to: d };
}

function renderDayPicker(mount, opts) {
    let view = startOfDay(opts.view || opts.selected || new Date());
    let yearOpen = false;

    function setView(d) { view = startOfDay(d); opts.onNavigate?.(view); render(); }

    function render() {
        mount.innerHTML = '';

        // Header: [ Måned ÅÅÅÅ ▾ ]  ……  ‹ ›
        const nav = document.createElement('div');
        nav.className = 'rp-cal-nav';
        const title = document.createElement('button');
        title.type = 'button';
        title.className = 'rp-cal-title' + (yearOpen ? ' open' : '');
        title.textContent = MONTH_NAMES[view.getMonth()] + ' ' + view.getFullYear();
        title.addEventListener('click', () => { yearOpen = !yearOpen; render(); });
        const arrows = document.createElement('div');
        arrows.className = 'rp-cal-arrows';
        const prev = document.createElement('button');
        prev.type = 'button'; prev.className = 'rp-cal-navbtn'; prev.innerHTML = '‹';
        const next = document.createElement('button');
        next.type = 'button'; next.className = 'rp-cal-navbtn'; next.innerHTML = '›';
        prev.addEventListener('click', () => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1)));
        next.addEventListener('click', () => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1)));
        arrows.appendChild(prev); arrows.appendChild(next);
        nav.appendChild(title); nav.appendChild(arrows);
        mount.appendChild(nav);

        if (yearOpen) {
            renderYearGrid(mount, view.getFullYear(), (y) => {
                yearOpen = false;
                setView(new Date(y, view.getMonth(), 1));
            });
            return;   // year grid replaces the day grid while open
        }

        const grid = document.createElement('div');
        grid.className = 'rp-cal-grid';
        WEEKDAY_LABELS.forEach(l => {
            const h = document.createElement('div');
            h.className = 'rp-cal-hcell';
            h.textContent = l;
            grid.appendChild(h);
        });

        const sel = opts.selected ? +startOfDay(opts.selected) : null;
        const monthIdx = view.getMonth();
        let cur = startOfWeekMon(new Date(view.getFullYear(), monthIdx, 1));

        for (let i = 0; i < 42; i++) {
            const day = addDays(cur, i);
            const cell = document.createElement('div');
            cell.className = 'rp-cal-cell rp-cal-day';
            if (day.getMonth() !== monthIdx) cell.classList.add('muted');
            if (sel != null && +startOfDay(day) === sel) cell.classList.add('sel');
            cell.textContent = String(day.getDate());
            cell.addEventListener('click', () => opts.onPickDay(day));
            grid.appendChild(cell);
        }
        mount.appendChild(grid);
    }
    render();
}

// Year quick-jump: scrollable 4-col grid, current year highlighted + scrolled
// into view. Lives inside the count popover, so the popover's outside-click
// handler already ignores clicks on it.
function renderYearGrid(mount, currentYear, onPick) {
    const seedY = new Date().getFullYear();
    const grid = document.createElement('div');
    grid.className = 'rp-cal-yeargrid';
    let selEl = null;
    for (let y = seedY - CAL_YEAR_BACK; y <= seedY + CAL_YEAR_FWD; y++) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'rp-cal-year' + (y === currentYear ? ' sel' : '');
        cell.textContent = String(y);
        cell.addEventListener('click', () => onPick(y));
        if (y === currentYear) selEl = cell;
        grid.appendChild(cell);
    }
    mount.appendChild(grid);
    selEl?.scrollIntoView({ block: 'center' });
}

// ponytail: console-only self-check for the day-clamp logic — call demo() from
// the browser console after pasting. Not auto-run (would log on every load).
function demo() {
    const aug10 = new Date(2026, 7, 10), aug20 = new Date(2026, 7, 20);
    // pick 'to' before 'from' → from pulls back
    let r = applyPick(aug20, null, 'to', aug10);
    console.assert(+r.to === +startOfDay(aug10), 'to set to picked day');
    r = applyPick(aug20, aug20, 'to', aug10);
    console.assert(+r.from === +startOfDay(aug10), 'to before from pulls from back');
    // pick 'from' after 'to' → to pushes forward
    r = applyPick(aug10, aug10, 'from', aug20);
    console.assert(+r.to === +startOfDay(aug20), 'from after to pushes to forward');
    // ordinary pick leaves the other end untouched
    r = applyPick(aug10, aug20, 'from', new Date(2026, 7, 12));
    console.assert(+r.to === +startOfDay(aug20), 'other end untouched when order ok');
    console.log('[req-planner] day-picker self-check passed');
}

// ═══ 9. DRAG INTERACTIONS (create / move / resize / click-edit) ═════════════
function setTooltip(n) {
    if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.className = 'rp-tooltip';
        document.body.appendChild(tooltipEl);
    }
    tooltipEl.textContent = n + ' uke' + (n === 1 ? '' : 'r');
    tooltipEl.style.display = 'block';
}
function moveTooltip(x, y) {
    if (tooltipEl) { tooltipEl.style.left = (x + 14) + 'px'; tooltipEl.style.top = (y + 14) + 'px'; }
}
function hideTooltip() { if (tooltipEl) tooltipEl.style.display = 'none'; }

// NOTE: There is intentionally no client-side overlap check. Overlapping
// periods are legal input — the createProjectRequirement action in Appfarm
// splits, trims, and merges existing periods server-side.

/** Turn the dashed ghost into a real-looking bar with the confirmed count
 *  (optimistic UI — the rebuild after save swaps in the persisted bar). */
function promoteGhost(ghost, srcEnum, count) {
    ghost.className = 'rp-bar rp-bar-' + (SOURCE_CLASS[srcEnum] || 'behov');
    ghost.innerHTML = '<span class="rp-bar-count">' + count + '</span>';
}

function onPointerDown(e) {
    if (e.button !== 0) return;

    const track = e.target.closest('.rp-track-editable');
    if (!track || !track.dataset.projectId) return;

    // Capture geometry and target refs before removePopover(), which may trigger
    // flushQueuedRebuild → buildAll → innerHTML='', detaching the track element.
    // getBoundingClientRect() on a detached element returns all zeros.
    const trackRect = track.getBoundingClientRect();
    const bar = e.target.closest('.rp-bar');

    removePopover();

    if (bar) {
        const rec = reqById.get(bar.dataset.reqId);
        if (!rec) return;
        const handle = e.target.closest('.rp-handle');
        activeDrag = {
            mode:        handle ? (handle.dataset.edge === 'l' ? 'resize-l' : 'resize-r') : 'move',
            bar,
            reqId:       rec._id,
            projectId:   track.dataset.projectId,
            source:      toInt(track.dataset.source),
            workType:    toInt(track.dataset.workType),
            origFrom:    startOfDay(new Date(rec.dateFrom)),
            origTo:      endOfDay(new Date(rec.dateTo)),
            origCount:   rec.resourceCount || 0,
            trackRect,
            startColIdx: colIdxFromClientX(e.clientX, trackRect),
            startX:      e.clientX,
            moved:       false
        };
        bar.style.zIndex = '5';
    } else {
        const idx = colIdxFromClientX(e.clientX, trackRect);
        const ghost = document.createElement('div');
        ghost.className = 'rp-bar rp-bar-ghost';
        ghost.style.left  = (idx * COL_W) + 'px';
        ghost.style.width = COL_W + 'px';
        track.appendChild(ghost);

        activeDrag = {
            mode:      'create',
            bar:       ghost,
            track,
            trackRect,
            projectId: track.dataset.projectId,
            source:    toInt(track.dataset.source),
            workType:  toInt(track.dataset.workType),
            origS:     idx,
            origE:     idx,
            startX:    e.clientX,
            moved:     false
        };
    }

    document.getElementById('rp-inner')?.classList.add('rp-dragging');
    e.preventDefault();
    document.addEventListener('mousemove', onPointerMove);
    document.addEventListener('mouseup',   onPointerUp);
}

function onPointerMove(e) {
    if (!activeDrag) return;
    if (Math.abs(e.clientX - activeDrag.startX) > DRAG_THRESHOLD_PX) activeDrag.moved = true;

    if (activeDrag.mode === 'create') {
        const cur = colIdxFromClientX(e.clientX, activeDrag.trackRect);
        const s  = Math.min(activeDrag.origS, cur);
        const ed = Math.max(activeDrag.origS, cur);
        activeDrag.curS = s;
        activeDrag.curE = ed;
        activeDrag.bar.style.left  = (s * COL_W) + 'px';
        activeDrag.bar.style.width = ((ed - s + 1) * COL_W) + 'px';
        setTooltip(ed - s + 1);
        moveTooltip(e.clientX, e.clientY);
        return;
    }

    // Move / resize — snap to whole weeks.
    // Column-index delta avoids the jump caused by Math.round when the cursor
    // lands mid-column at mousedown (pixel offset would round to ±1 immediately).
    const deltaWeeks = colIdxFromClientX(e.clientX, activeDrag.trackRect) - activeDrag.startColIdx;
    let from = activeDrag.origFrom, to = activeDrag.origTo;

    if (activeDrag.mode === 'move') {
        from = addDays(from, deltaWeeks * 7);
        to   = addDays(to,   deltaWeeks * 7);
    } else if (activeDrag.mode === 'resize-r') {
        to = addDays(to, deltaWeeks * 7);
        if (+to < +from) to = endOfWeekMon(from);
    } else if (activeDrag.mode === 'resize-l') {
        from = addDays(from, deltaWeeks * 7);
        if (+from > +to) from = startOfWeekMon(to);
    }

    activeDrag.curFrom = from;
    activeDrag.curTo   = to;
    const l = xForDate(from), r = xForDate(endOfDay(to));
    activeDrag.bar.style.left  = l + 'px';
    activeDrag.bar.style.width = Math.max(r - l, COL_W) + 'px';

    const weeks = Math.max(1, Math.round((+startOfDay(to) - +startOfDay(from)) / DAY_MS / 7) + 1);
    setTooltip(weeks);
    moveTooltip(e.clientX, e.clientY);
}

function onPointerUp(e) {
    document.removeEventListener('mousemove', onPointerMove);
    document.removeEventListener('mouseup',   onPointerUp);
    document.getElementById('rp-inner')?.classList.remove('rp-dragging');
    hideTooltip();

    const d = activeDrag;
    activeDrag = null;
    if (!d) { flushQueuedRebuild(); return; }

    // ── CREATE: ghost stays visible while the count popover is open ──────
    if (d.mode === 'create') {
        // A plain click (no drag) registers a single week — curS/curE are unset,
        // so this falls through to origS..origS = one column.
        const s  = clampIdx(d.curS ?? d.origS);
        const ed = clampIdx(d.curE ?? d.origE);
        const dateFrom = columns[s].start;
        const dateTo   = columns[ed].end;

        showCountPopover({
            anchorX:    e.clientX,
            anchorY:    e.clientY,
            defaultCount: 1,
            dateFrom,
            dateTo,
            onConfirm:  (count, fromISO, toISO) => {
                promoteGhost(d.bar, d.source, count);
                appfarm.actions?.createProjectRequirement?.({
                    projectId: d.projectId,
                    source:    d.source,
                    workType:  d.workType,
                    dateFrom:  fromISO,
                    dateTo:    toISO,
                    count
                });
            },
            onCancel: () => d.bar.remove()
        });
        return;
    }

    d.bar.style.zIndex = '';

    // ── CLICK (no movement): edit count / delete ─────────────────────────
    if (!d.moved) {
        const rec = reqById.get(d.reqId);
        if (!rec) { flushQueuedRebuild(); return; }
        showCountPopover({
            anchorX:    e.clientX,
            anchorY:    e.clientY,
            defaultCount: rec.resourceCount || 0,
            dateFrom:   new Date(rec.dateFrom),
            dateTo:     new Date(rec.dateTo),
            onConfirm:  (count, fromISO, toISO) => {
                const countEl = /** @type {HTMLElement} */ (d.bar.querySelector('.rp-bar-count'));
                if (countEl) countEl.textContent = count;
                appfarm.actions?.updateProjectRequirement?.({
                    projectRequirementId: rec._id,
                    dateFrom:      fromISO,
                    dateTo:        toISO,
                    count
                });
            },
            onDelete: () => {
                d.bar.remove();                                   // optimistic
                appfarm.actions?.deleteProjectRequirement?.({
                    projectRequirementId: rec._id
                });
            }
        });
        return;
    }

    // ── MOVE / RESIZE: snap to week boundaries and save ─────────────────────
    const from = startOfWeekMon(d.curFrom ?? d.origFrom);
    let   to   = endOfWeekMon(d.curTo ?? d.origTo);
    if (+to < +from) to = endOfWeekMon(from);

    appfarm.actions?.updateProjectRequirement?.({
        projectRequirementId: d.reqId,
        dateFrom:      from.toISOString(),
        dateTo:        to.toISOString(),
        count:      d.origCount
    });
    flushQueuedRebuild();
}

// ═══ 9b. LANE-HOVER LIFT ════════════════════════════════════════════════════
//  Lift the editable span the cursor is splitting under: cursor X inside the
//  span's period (from→to) AND cursor Y in the lane beneath the span body. The
//  body stays put (it's the grab zone); only the lane lifts its span. Bars are
//  absolutely positioned in their track, so offsetLeft/Top/Width/Height already
//  give the span's pixel box.
function setLift(bar) {
    if (liftedBar === bar) return;
    if (liftedBar) liftedBar.classList.remove('rp-lifted');
    liftedBar = bar;
    if (liftedBar) liftedBar.classList.add('rp-lifted');
}

// ponytail: O(bars-in-track) scan per mousemove — fine for the few spans per
// row; add a cache only if a row ever holds many bars.
function onHoverMove(e) {
    if (activeDrag) return;                            // don't fight a drag
    const track = e.target.closest?.('.rp-track-editable');
    if (!track) return setLift(null);
    const rect = track.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let hit = null;
    track.querySelectorAll('.rp-bar:not(.rp-bar-ghost)').forEach(bar => {
        const inX    = x >= bar.offsetLeft && x <= bar.offsetLeft + bar.offsetWidth;
        const inLane = y > bar.offsetTop + bar.offsetHeight;   // below the span body
        if (inX && inLane) hit = bar;                          // over the body → no lift
    });
    setLift(hit);
}

// ═══ 10. LIFECYCLE ══════════════════════════════════════════════════════════
function ensureSkeleton() {
    const root = document.getElementById('req-planner');
    if (!root) return;
    root.innerHTML =
        '<div id="rp-scroll" class="rp-scroll">' +
            '<div id="rp-inner" class="rp-inner"></div>' +
        '</div>';
}

let initialized = false;
function init() {
    if (initialized) return;
    initialized = true;
    ensureSkeleton();

    const innerEl = document.getElementById('rp-inner');
    innerEl?.addEventListener('mousedown', onPointerDown);
    innerEl?.addEventListener('mousemove', onHoverMove);
    innerEl?.addEventListener('mouseleave', () => setLift(null));

    buildAll();

    // Any structural or data change → guarded rebuild
    ['source', 'projects', 'projectWorkType', 'calendarWeekWidthPixel',
     'workTypeEnum', 'viewFrom', 'viewTo',
     'projectRequirements', 'allocation', 'absence',
     'jobs', 'resourcesAvailable']
        .forEach(name => appfarm.data[name]?.on?.('change', guardedBuildAll));
}

if (document.readyState === 'complete' || document.readyState === 'interactive') init();
else document.addEventListener('DOMContentLoaded', init);
