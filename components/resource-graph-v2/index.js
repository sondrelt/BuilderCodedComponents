// =============================================================================
//  Resource Graph — v2
//
//  Same weekly stacked-bar + behov-line chart as resource-graph v1, but the
//  numbers are computed live from the RAW sources the resource-req-v2 planner
//  uses, instead of the pre-aggregated `perProjectData`. That keeps this graph
//  numerically identical to the planner (no parallel aggregation to drift).
//
//  Data sources:
//    projectRequirements { project, source, workType, dateFrom, dateTo, resourceCount }
//    allocation          { project, workType, dateFrom, dateTo }
//    workTypeEnum        { enum_value, enum_name }   — work-type filter labels
//    projects            active-project filter set
//    viewFrom, viewTo    week-window bounds
//
//  Aggregation mirrors the planner exactly:
//    Behov/Innleide/Utleide = sum of projectRequirements.resourceCount per week
//    Egne                   = count of overlapping allocation rows per week
//    Udekt                  = max(0, behov − egne − innleide)
//    Overskudd              = max(0, −(behov − egne − innleide))
//    (Utleide is NOT part of the coverage diff — same as the planner.)
//
//  External dependency: Chart.js via CDN (add as Script URL in Resources).
// =============================================================================

// NOTE: No 'use strict' — Appfarm wraps this in a generated function with a
// non-simple parameter list, where a 'use strict' directive is a SyntaxError.

const ns = appfarm;

// ═══ 1. CONFIG ════════════════════════════════════════════════════════════
const SRC = { BEHOV: 10, EGNE: 20, INNLEIDE: 30, UTLEIDE: 35, UDEKT: 40, OVERSKUDD: 50 };

// Solid chart palette (carried over from resource-graph v1)
const COLORS = {
    behov:     'rgb(31,41,46)',
    egne:      'rgb(149,187,134)',
    innleide:  'rgb(78,173,228)',
    utleide:   'rgb(252,207,151)',
    udekt:     'rgb(214,116,113)',
    overskudd: 'rgb(87,128,71)'
};

const FALLBACK_WEEKS = 20;   // window when viewFrom/viewTo are unset

// ═══ 2. UTILITIES (copied from resource-req-v2) ═══════════════════════════════
const safeGet   = (ds) => ds?.get?.() || [];
const resolveId = (ref) => (ref && typeof ref === 'object' ? ref._id : ref);
const toInt     = (v) => { const n = parseInt(v, 10); return Number.isNaN(n) ? null : n; };

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

// ═══ 3. STATE ═══════════════════════════════════════════════════════════════
let weeks         = [];   // [{ start, end, label }]
let rangeStart    = null;
let rangeEnd      = null;
let chartInstance = null;

// ═══ 4. WEEK AXIS ═════════════════════════════════════════════════════════════
// Simplified from the planner's buildColumns — date bounds + ISO-week label only.
function buildWeeks() {
    const vf = ns.data.viewFrom?.get?.();
    const vt = ns.data.viewTo?.get?.();
    rangeStart = startOfWeekMon(vf ? new Date(vf) : new Date());
    rangeEnd   = vt ? endOfWeekMon(new Date(vt))
                    : endOfWeekMon(addDays(rangeStart, 7 * FALLBACK_WEEKS));

    weeks = [];
    let cur = new Date(rangeStart);
    while (+cur <= +rangeEnd) {
        const wEnd = endOfWeekMon(cur);
        weeks.push({ start: new Date(cur), end: wEnd, label: 'Uke ' + getISOWeek(cur) });
        cur = startOfDay(addDays(wEnd, 1));   // midnight start — avoid 24h dead zone
    }
}

/** Index of the week bucket containing date d, or -1 if outside the window. */
function weekIndexForDate(d) {
    const t = +d;
    let lo = 0, hi = weeks.length - 1;
    while (lo <= hi) {
        const m = (lo + hi) >> 1;
        if (t < +weeks[m].start)    hi = m - 1;
        else if (t > +weeks[m].end) lo = m + 1;
        else return m;
    }
    return -1;
}

// ═══ 5. AGGREGATION (mirrors planner math, summed across active projects) ═════
// Paint a span's value onto every week it overlaps, clamped to the window.
function paint(arr, fromRaw, toRaw, val) {
    if (!val) return;
    const from = startOfDay(new Date(fromRaw));
    const to   = endOfDay(new Date(toRaw));
    if (isNaN(+from) || isNaN(+to)) return;
    if (+to < +rangeStart || +from > +rangeEnd) return;
    let s = weekIndexForDate(from); if (s < 0) s = 0;
    let e = weekIndexForDate(to);   if (e < 0) e = weeks.length - 1;
    for (let i = s; i <= e; i++) arr[i] += val;
}

function aggregate(selectedWorkType) {
    const N = weeks.length;
    const wt = selectedWorkType ? toInt(selectedWorkType) : null;

    const activeIds = new Set(safeGet(ns.data.projects).map(p => p._id || p.id));
    const inScope = (projRef) => activeIds.size === 0 || activeIds.has(resolveId(projRef));

    const out = {
        behov:     new Array(N).fill(0),
        egne:      new Array(N).fill(0),
        innleide:  new Array(N).fill(0),
        utleide:   new Array(N).fill(0),
        udekt:     new Array(N).fill(0),
        overskudd: new Array(N).fill(0)
    };
    const bySrc = { [SRC.BEHOV]: out.behov, [SRC.INNLEIDE]: out.innleide, [SRC.UTLEIDE]: out.utleide };

    // Requirement spans (behov / innleide / utleide)
    safeGet(ns.data.projectRequirements).forEach(r => {
        if (!inScope(r.project)) return;
        if (wt !== null && toInt(r.workType) !== wt) return;
        const arr = bySrc[toInt(r.source)];
        if (!arr) return;
        if (isNaN(+new Date(r.dateFrom)) || isNaN(+new Date(r.dateTo))) {
            console.warn('[resource-graph-v2] requirement with invalid dates skipped:', r._id);
            return;
        }
        paint(arr, r.dateFrom, r.dateTo, r.resourceCount || 0);
    });

    // Egne from allocations (an allocation without a workType counts for all)
    safeGet(ns.data.allocation).forEach(a => {
        if (!inScope(a.project)) return;
        const aWt = toInt(a.workType);
        if (wt !== null && aWt !== null && aWt !== wt) return;
        paint(out.egne, a.dateFrom, a.dateTo, 1);
    });

    // Derive Udekt / Overskudd per week
    for (let i = 0; i < N; i++) {
        const diff = out.behov[i] - out.egne[i] - out.innleide[i];
        out.udekt[i]     = Math.max(0, diff);
        out.overskudd[i] = Math.max(0, -diff);
    }
    return out;
}

// ═══ 6. WORK-TYPE FILTER ══════════════════════════════════════════════════════
// Only list work types that actually appear in the active projects' requirements.
function populateWorkTypeFilter() {
    const select = ns.element.querySelector('#work-type-filter');
    if (!select) return;

    const activeIds = new Set(safeGet(ns.data.projects).map(p => p._id || p.id));
    const used = new Set();
    safeGet(ns.data.projectRequirements).forEach(r => {
        if (activeIds.size && !activeIds.has(resolveId(r.project))) return;
        const v = toInt(r.workType);
        if (v != null) used.add(v);
    });

    const prev = select.value;
    while (select.options.length) select.remove(0);
    const def = document.createElement('option');
    def.value = '';
    def.textContent = 'Alle arbeidstyper';
    select.appendChild(def);

    safeGet(ns.data.workTypeEnum).forEach(item => {
        const v = toInt(item?.enum_value);
        if (v == null || !used.has(v)) return;
        const opt = document.createElement('option');
        opt.value = String(v);
        opt.textContent = item.enum_name || String(v);
        select.appendChild(opt);
    });
    if (prev && [...select.options].some(o => o.value === prev)) select.value = prev;
}

// ═══ 7. CHART ═════════════════════════════════════════════════════════════════
function renderChart() {
    buildWeeks();
    if (!weeks.length) return;

    const select = ns.element.querySelector('#work-type-filter');
    const data = aggregate(select ? select.value : '');

    const canvas = /** @type {HTMLCanvasElement} */ (ns.element.querySelector('#resourceChart'));
    if (!canvas) return;
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

    chartInstance = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: weeks.map(w => w.label),
            datasets: [
                { label: 'Egne ansatte', data: data.egne,      backgroundColor: COLORS.egne,      stack: 'stack1', order: 3, borderRadius: 2, barPercentage: 0.7, categoryPercentage: 0.8 },
                { label: 'Innleide',     data: data.innleide,   backgroundColor: COLORS.innleide,  stack: 'stack1', order: 3, borderRadius: 2, barPercentage: 0.7, categoryPercentage: 0.8 },
                { label: 'Utleide',      data: data.utleide,    backgroundColor: COLORS.utleide,   stack: 'stack1', order: 3, borderRadius: 2, barPercentage: 0.7, categoryPercentage: 0.8 },
                { label: 'Udekt behov',  data: data.udekt,      backgroundColor: COLORS.udekt,     stack: 'stack1', order: 3, borderRadius: 2, barPercentage: 0.7, categoryPercentage: 0.8 },
                { label: 'Overskudd',    data: data.overskudd,  backgroundColor: COLORS.overskudd, stack: 'stack1', order: 3, borderRadius: 2, barPercentage: 0.7, categoryPercentage: 0.8 },
                { label: 'Behov', data: data.behov, type: 'line', borderColor: COLORS.behov, backgroundColor: 'transparent',
                  pointBackgroundColor: COLORS.behov, pointRadius: 4, pointHoverRadius: 6,
                  borderWidth: 2.5, tension: 0.25, order: 1, fill: false }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                // ponytail: Chart.js's built-in legend already toggles datasets on
                // click — that's the "legend toggles" feature, no hand-rolled legend.
                legend: {
                    position: 'top', align: 'start',
                    labels: { font: { family: 'Lato', size: 12 }, color: 'rgb(31,41,46)', boxWidth: 12, boxHeight: 12 }
                },
                tooltip: {
                    backgroundColor: 'rgb(31,41,46)',
                    titleFont: { family: 'Lato', size: 13, weight: '600' },
                    bodyFont: { family: 'Lato', size: 12 },
                    padding: 12, cornerRadius: 8,
                    callbacks: {
                        label: (ctx) => {
                            const v = ctx.parsed.y;
                            if (!v) return null;
                            return ctx.dataset.label + ': ' + v;
                        }
                    }
                }
            },
            scales: {
                x: { stacked: true, grid: { display: false }, ticks: { font: { family: 'Lato', size: 11 }, color: 'rgb(77,100,112)', maxRotation: 0 }, border: { color: 'rgb(157,178,189)' } },
                y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(157,178,189,0.3)', drawBorder: false }, ticks: { font: { family: 'Lato', size: 11 }, color: 'rgb(77,100,112)', stepSize: 1, precision: 0 }, border: { display: false } }
            }
        }
    });
}

// ═══ 8. LIFECYCLE ═════════════════════════════════════════════════════════════
function refresh() {
    populateWorkTypeFilter();
    renderChart();
}

function init() {
    populateWorkTypeFilter();
    renderChart();

    ns.element.querySelector('#work-type-filter')?.addEventListener('change', renderChart);

    ['projectRequirements', 'allocation', 'projects', 'workTypeEnum', 'viewFrom', 'viewTo']
        .forEach(name => ns.data[name]?.on?.('change', refresh));

    ns.on?.('unload', () => {
        if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    });
}

if (document.readyState === 'complete' || document.readyState === 'interactive') init();
else document.addEventListener('DOMContentLoaded', init);
