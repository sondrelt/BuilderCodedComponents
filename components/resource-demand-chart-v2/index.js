// =============================================================================
//  Project Requirements Planner — v2 (optimized rewrite)
//
//  Data source:  projectRequirements { project, source, workType, dateFrom, dateTo, quantity }
//  Appfarm actions called (all via optional chaining — a missing action is a
//  silent no-op instead of a thrown TypeError):
//    createProjectRequirement { projectId, source, workType, dateFrom, dateTo, quantity }
//    updateProjectRequirement { requirementId, dateFrom, dateTo, quantity }
//    deleteProjectRequirement { requirementId }
//    toggleDetails / editProject / openGraph / viewBuilderAds (unchanged)
//
//  Changes vs v1 (no functionality or UX removed):
//    • Ghost bar now STAYS VISIBLE while the quantity popover is open, and is
//      promoted to a real-looking bar instantly on confirm (optimistic UI).
//      The datasource change then rebuilds and swaps in the persisted bar.
//    • Click-editing an existing bar updates its quantity optimistically too,
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

const EDITABLE_SOURCES = new Set([SRC.BEHOV, SRC.INNLEIDE, SRC.UTLEIDE]); // user draws bars
const BAR_SOURCES      = [SRC.BEHOV, SRC.INNLEIDE, SRC.UTLEIDE];          // sources stored as spans
const POPOVER_SOURCES  = new Set([SRC.INNLEIDE, SRC.UTLEIDE, SRC.UDEKT, SRC.OVERSKUDD]);

const STICKY_W          = 280;   // left panel width (px) — keep in sync with CSS --rp-sticky-w
const DEFAULT_COL_W     = 60;
const FALLBACK_WEEKS    = 20;    // window when viewFrom/viewTo are unset
const DAY_MS            = 86400000;
const DRAG_THRESHOLD_PX = 4;     // movement below this = click, not drag
const MONTHS_NB = ['jan','feb','mar','apr','mai','jun','jul','aug','sep','okt','nov','des'];

const ICONS = {
    chevronDown: '<svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 4l4 4 4-4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>',
    chevronUp:   '<svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 8l4-4 4 4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>',
    edit:        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
    graph:       '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 17V13M12 17V9M16 17V13"/></svg>',
    search:      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>'
};

// ═══ 2. UTILITIES ═══════════════════════════════════════════════════════════
const safeGet   = (ds) => ds?.get?.() || [];
const resolveId = (ref) => (ref && typeof ref === 'object' ? ref._id : ref);
const toInt     = (v) => { const n = parseInt(v, 10); return Number.isNaN(n) ? null : n; };
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
function getContrastColor(hex) {
    if (!hex) return '#1e293b';
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? '#1e293b' : '#ffffff';
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
let wtNameMap       = {};        // workType enum_value → enum_name

let activeDrag    = null;
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
            index:    columns.length,
            start:    new Date(cur),
            end:      wEnd,
            left:     gridWidth,
            width:    COL_W,
            label:    String(getISOWeek(cur)),
            topLabel: MONTHS_NB[cur.getMonth()],
            topYear:  getISOWeekYear(cur)
        });
        gridWidth += COL_W;
        cur = addDays(wEnd, 1);
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
}

// ═══ 6. AGGREGATES ══════════════════════════════════════════════════════════
//  Egne      = allocation count on this project overlapping the column's week
//  Udekt     = max(0, Behov − Egne − Innleide)
//  Overskudd = max(0, Egne + Innleide − Behov)
//
//  Each record's span is painted onto a per-(source, workType) column array
//  exactly once; headers are column-wise sums across work types.
function computeAggregates(projectId, workTypes) {
    const N      = columns.length;
    const detail = new Map(); // `${src}_${wt}` → number[N]
    const header = new Map(); // src → number[N]
    const detailArr = (src, wt) => {
        const k = src + '_' + wt;
        let a = detail.get(k);
        if (!a) detail.set(k, (a = new Array(N).fill(0)));
        return a;
    };

    function paint(arr, fromRaw, toRaw, val) {
        if (!val) return;
        const from = startOfDay(new Date(fromRaw));
        const to   = endOfDay(new Date(toRaw));
        if (isNaN(+from) || isNaN(+to)) return;
        if (+to < +rangeStart || +from > +rangeEnd) return;
        const s = clampIdx(colIndexForDate(from));
        const e = clampIdx(colIndexForDate(to));
        for (let i = s; i <= e; i++) arr[i] += val;
    }

    // Requirement bars (Behov / Innleide / Utleide)
    workTypes.forEach(wt => {
        BAR_SOURCES.forEach(src => {
            (reqsByKey.get(reqKey(projectId, src, wt)) || []).forEach(r =>
                paint(detailArr(src, wt), r.dateFrom, r.dateTo, r.quantity || 0));
        });
    });

    // Egne from allocations (an allocation without a workType counts for all)
    (allocsByProject.get(projectId) || []).forEach(a => {
        const aWt = toInt(a.workType);
        workTypes.forEach(wt => {
            if (aWt !== null && aWt !== wt) return;
            paint(detailArr(SRC.EGNE, wt), a.dateFrom, a.dateTo, 1);
        });
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

    // Headers = column-wise sums across work types (incl. Utleide, fixed in v2)
    Object.values(SRC).forEach(src => {
        const h = new Array(N).fill(0);
        workTypes.forEach(wt => {
            const d = detail.get(src + '_' + wt);
            if (d) for (let i = 0; i < N; i++) h[i] += d[i];
        });
        header.set(src, h);
    });

    return {
        detail: (src, wt, i) => detail.get(src + '_' + wt)?.[i] || 0,
        header: (src, i)     => header.get(src)?.[i] || 0
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
        '<span class="rp-bar-qty">' + (rec.quantity ?? 0) + '</span>' +
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
        .forEach(r => track.appendChild(makeBar(r, srcClass)));
    return track;
}

function makeDerivedTrack(agg, srcEnum, workType) {
    const track = document.createElement('div');
    track.className = 'rp-track rp-track-derived';
    track.style.width = gridWidth + 'px';
    columns.forEach((_, ci) => {
        const cell = document.createElement('div');
        cell.className = 'rp-derived-cell';
        cell.style.width = COL_W + 'px';
        const val = agg.detail(srcEnum, workType, ci);
        cell.textContent = val || '';
        if (srcEnum === SRC.UDEKT     && val > 0) cell.classList.add('rp-neg');
        if (srcEnum === SRC.OVERSKUDD && val > 0) cell.classList.add('rp-pos');
        track.appendChild(cell);
    });
    return track;
}

function makeSummaryTrack(agg, projectId, srcEnum, srcClass) {
    const track = document.createElement('div');
    track.className = 'rp-track rp-track-summary';
    track.style.width = gridWidth + 'px';
    const last = columns.length - 1;
    columns.forEach((_, ci) => {
        const cell = document.createElement('div');
        cell.className = 'rp-summary-cell rp-summary-cell-' + srcClass;
        cell.style.width = COL_W + 'px';
        cell.textContent = agg.header(srcEnum, ci) || '';
        if (ci === last && POPOVER_SOURCES.has(srcEnum)) {
            const btn = document.createElement('button');
            btn.className = 'rp-popover-btn';
            btn.innerHTML = ICONS.search;
            btn.title = 'Se detaljer';
            btn.addEventListener('click', e =>
                appfarm.actions?.viewBuilderAds?.({ source: srcEnum, projectId }, { event: e }));
            cell.appendChild(btn);
        }
        track.appendChild(cell);
    });
    return track;
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
    const color     = project.colorHexCode || '#e2e8f0';

    const row = document.createElement('div');
    row.className = 'rp-group-head';
    row.style.width = (STICKY_W + gridWidth) + 'px';

    const inner = document.createElement('div');
    inner.className = 'rp-group-label';
    inner.style.background = color;
    inner.style.color      = getContrastColor(color);

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
    buildHeader(inner);

    const allProjects  = safeGet(appfarm.data.projects);
    const allSources   = safeGet(appfarm.data.source);
    const allWorkTypes = safeGet(appfarm.data.projectWorkType);
    const frag         = document.createDocumentFragment();

    allProjects.forEach(project => {
        const projectId   = project._id;
        const showDetails = !!project.detailsShowBOL;

        const projectWTs = allWorkTypes
            .filter(wt => resolveId(wt.project) === projectId)
            .map(wt => toInt(wt.workType))
            .filter(wt => wt != null);

        const agg = computeAggregates(projectId, projectWTs);

        frag.appendChild(makeGroupHeader(project, showDetails));

        allSources.forEach(src => {
            const srcEnum = toInt(src.enum_value);
            if (srcEnum == null) return;
            const srcClass   = SOURCE_CLASS[srcEnum] || 'behov';
            const isEditable = EDITABLE_SOURCES.has(srcEnum);

            // Source summary row (aggregate across all work types, read-only)
            const srcRow = document.createElement('div');
            srcRow.className = 'rp-row rp-row-source-header';

            const srcLabel = document.createElement('div');
            srcLabel.className = 'rp-label-cell rp-source-label rp-source-label-' + srcClass;
            srcLabel.textContent = src.enum_name || '';

            srcRow.appendChild(srcLabel);
            srcRow.appendChild(makeSummaryTrack(agg, projectId, srcEnum, srcClass));
            frag.appendChild(srcRow);

            // Work-type detail rows (only when project is expanded)
            if (!showDetails) return;
            projectWTs.forEach(wtId => {
                const wtRow = document.createElement('div');
                wtRow.className = 'rp-row rp-row-wt'
                    + (isEditable ? ' rp-row-editable' : ' rp-row-derived');

                const wtLabel = document.createElement('div');
                wtLabel.className = 'rp-label-cell rp-wt-label';
                wtLabel.textContent = wtNameMap[wtId] || String(wtId);

                wtRow.appendChild(wtLabel);
                wtRow.appendChild(isEditable
                    ? makeEditableTrack(projectId, srcEnum, srcClass, wtId, src.enum_name)
                    : makeDerivedTrack(agg, srcEnum, wtId));
                frag.appendChild(wtRow);
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

// ═══ 8. QUANTITY POPOVER ════════════════════════════════════════════════════
//  Anchored to the cursor, input focused immediately.
//  Enter = confirm · Esc / click-outside = cancel · optional Slett = delete.
//  While open, activeEdit blocks rebuilds so the pending ghost survives.
function showQuantityPopover(opts) {
    // opts: { anchorX, anchorY, defaultQty, onConfirm, onCancel?, onDelete? }
    removePopover();
    activeEdit = true;

    const showDelete = typeof opts.onDelete === 'function'
        && typeof appfarm.actions?.deleteProjectRequirement === 'function';

    popoverEl = document.createElement('div');
    popoverEl.className = 'rp-popover';
    popoverEl.innerHTML =
        '<div class="rp-popover-title">Antall ressurser</div>' +
        '<input class="rp-popover-input" type="number" min="0" step="1" value="' + (opts.defaultQty ?? 1) + '" />' +
        '<div class="rp-popover-hint">Enter for å lagre &nbsp;·&nbsp; Esc for å avbryte</div>' +
        '<div class="rp-popover-actions">' +
            '<button class="rp-popover-cancel">Avbryt</button>' +
            '<button class="rp-popover-confirm">Lagre</button>' +
        '</div>' +
        (showDelete ? '<button class="rp-popover-delete">Slett periode</button>' : '');
    document.body.appendChild(popoverEl);

    // Position: prefer right of cursor, flip left near the window edge
    const pw = 170;
    let left = opts.anchorX + 10;
    if (left + pw > window.innerWidth - 10) left = opts.anchorX - pw - 10;
    popoverEl.style.left = left + 'px';
    popoverEl.style.top  = (opts.anchorY - 16) + 'px';

    const input = popoverEl.querySelector('.rp-popover-input');
    input.focus();
    input.select();

    function confirm() {
        const qty = Math.max(0, parseInt(input.value, 10) || 0);
        removeOutsideHandler();
        opts.onConfirm(qty);
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
    popoverEl.querySelector('.rp-popover-cancel').addEventListener('click', cancel);
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

/** Turn the dashed ghost into a real-looking bar with the confirmed quantity
 *  (optimistic UI — the rebuild after save swaps in the persisted bar). */
function promoteGhost(ghost, srcEnum, qty) {
    ghost.className = 'rp-bar rp-bar-' + (SOURCE_CLASS[srcEnum] || 'behov');
    ghost.innerHTML = '<span class="rp-bar-qty">' + qty + '</span>';
}

function onPointerDown(e) {
    if (e.button !== 0) return;
    removePopover(); // closing a stale popover may flush a queued rebuild first

    const track = e.target.closest('.rp-track-editable');
    if (!track || !track.dataset.projectId) return;

    const trackRect = track.getBoundingClientRect();
    const bar = e.target.closest('.rp-bar');

    if (bar) {
        const rec = reqById.get(bar.dataset.reqId);
        if (!rec) return;
        const handle = e.target.closest('.rp-handle');
        activeDrag = {
            mode:      handle ? (handle.dataset.edge === 'l' ? 'resize-l' : 'resize-r') : 'move',
            bar,
            reqId:     rec._id,
            projectId: track.dataset.projectId,
            source:    toInt(track.dataset.source),
            workType:  toInt(track.dataset.workType),
            origFrom:  startOfDay(new Date(rec.dateFrom)),
            origTo:    endOfDay(new Date(rec.dateTo)),
            origQty:   rec.quantity || 0,
            startX:    e.clientX,
            moved:     false
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

    // Move / resize — snap to whole weeks
    const deltaWeeks = Math.round((e.clientX - activeDrag.startX) / COL_W);
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

    // ── CREATE: ghost stays visible while the quantity popover is open ──────
    if (d.mode === 'create') {
        if (!d.moved) { d.bar.remove(); flushQueuedRebuild(); return; }

        const s  = clampIdx(d.curS ?? d.origS);
        const ed = clampIdx(d.curE ?? d.origE);
        const dateFrom = columns[s].start;
        const dateTo   = columns[ed].end;

        showQuantityPopover({
            anchorX:    e.clientX,
            anchorY:    e.clientY,
            defaultQty: 1,
            onConfirm:  qty => {
                promoteGhost(d.bar, d.source, qty);
                appfarm.actions?.createProjectRequirement?.({
                    projectId: d.projectId,
                    source:    d.source,
                    workType:  d.workType,
                    dateFrom:  dateFrom.toISOString(),
                    dateTo:    dateTo.toISOString(),
                    quantity:  qty
                });
            },
            onCancel: () => d.bar.remove()
        });
        return;
    }

    d.bar.style.zIndex = '';

    // ── CLICK (no movement): edit quantity / delete ─────────────────────────
    if (!d.moved) {
        const rec = reqById.get(d.reqId);
        if (!rec) { flushQueuedRebuild(); return; }
        showQuantityPopover({
            anchorX:    e.clientX,
            anchorY:    e.clientY,
            defaultQty: rec.quantity || 0,
            onConfirm:  qty => {
                const qtyEl = d.bar.querySelector('.rp-bar-qty'); // optimistic
                if (qtyEl) qtyEl.textContent = qty;
                appfarm.actions?.updateProjectRequirement?.({
                    requirementId: rec._id,
                    projectId:     d.projectId,
                    source:        d.source,
                    workType:      d.workType,
                    dateFrom:      rec.dateFrom,
                    dateTo:        rec.dateTo,
                    quantity:      qty
                });
            },
            onDelete: () => {
                d.bar.remove();                                   // optimistic
                appfarm.actions?.deleteProjectRequirement?.({
                    requirementId: rec._id,
                    projectId:     d.projectId,
                    source:        d.source,
                    workType:      d.workType
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
        requirementId: d.reqId,
        projectId:     d.projectId,
        source:        d.source,
        workType:      d.workType,
        dateFrom:      from.toISOString(),
        dateTo:        to.toISOString(),
        quantity:      d.origQty
    });
    flushQueuedRebuild();
}

// ═══ 10. LIFECYCLE ══════════════════════════════════════════════════════════
function ensureSkeleton() {
    const root = document.getElementById('req-planner');
    if (!root || root.dataset.ready) return;
    root.dataset.ready = '1';
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

    document.getElementById('rp-inner')?.addEventListener('mousedown', onPointerDown);

    buildAll();

    // Any structural or data change → guarded rebuild
    ['source', 'projects', 'projectWorkType', 'calendarWeekWidthPixel',
     'workTypeEnum', 'viewFrom', 'viewTo',
     'projectRequirements', 'allocation']
        .forEach(name => appfarm.data[name]?.on?.('change', guardedBuildAll));
}

if (document.readyState === 'complete' || document.readyState === 'interactive') init();
else document.addEventListener('DOMContentLoaded', init);
