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
//    allocation          { project, workType, resource, dateFrom, dateTo }
//    absence             { resource, dateFrom, dateTo }   — person-global leave
//    workTypeEnum        { enum_value, enum_name }   — work-type filter labels
//    projects            active-project filter set
//    viewFrom, viewTo    week-window bounds
//
//  Aggregation mirrors the planner exactly:
//    Behov/Innleide/Utleide = sum of projectRequirements.resourceCount per week
//    Egne                   = distinct allocated persons present (minus absent) per week
//    Udekt                  = max(0, behov − egne − innleide)
//    Overskudd              = max(0, −(behov − egne − innleide))
//    (Utleide is NOT part of the coverage diff — same as the planner.)
//
//  External dependency: ApexCharts via CDN (add as Script URL in Resources).
// =============================================================================

// NOTE: No 'use strict' — Appfarm wraps this in a generated function with a
// non-simple parameter list, where a 'use strict' directive is a SyntaxError.

const ns = appfarm;

// ApexCharts is loaded globally from the CDN (Resources section); the
// type-checker can't see it, so grab it off window with an `any` cast.
const ApexCharts = /** @type {any} */ (window).ApexCharts;

// ═══ 1. CONFIG ════════════════════════════════════════════════════════════
const SRC = { BEHOV: 10, EGNE: 20, INNLEIDE: 30, UTLEIDE: 35, UDEKT: 40, OVERSKUDD: 50 };

// Source palette = resource-req-v2's work-type bar fills (--rp-*-bar), i.e. the
// exact colours of the bars that mark a resource need in the planner, so the two
// views match. Behov stays near-black — it's the reference line/circles here,
// not a stacked source.
const COLORS = {
    behov:     'rgb(31,41,46)',
    egne:      '#bcefd6',
    innleide:  '#fde68a',
    utleide:   '#c4b5fd',
    udekt:     '#fecaca',
    overskudd: '#a3e3f0'
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
let selectedWT    = '';   // '' = Alle arbeidstyper, else enum_value as string
let lastView      = null; // { labels, data } the chart is currently showing (for tooltip footer)

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
// Resolve a date span to the [startIdx, endIdx] week range it covers, clamped to
// the window. Returns null if the dates are invalid or fully outside the window.
function weekRange(fromRaw, toRaw) {
    const from = startOfDay(new Date(fromRaw));
    const to   = endOfDay(new Date(toRaw));
    if (isNaN(+from) || isNaN(+to)) return null;
    if (+to < +rangeStart || +from > +rangeEnd) return null;
    let s = weekIndexForDate(from); if (s < 0) s = 0;
    let e = weekIndexForDate(to);   if (e < 0) e = weeks.length - 1;
    return [s, e];
}
// Paint a span's value onto every week it overlaps, clamped to the window.
function paint(arr, fromRaw, toRaw, val) {
    if (!val) return;
    const r = weekRange(fromRaw, toRaw); if (!r) return;
    for (let i = r[0]; i <= r[1]; i++) arr[i] += val;
}
// Collect an id into the per-week Set for every week the span overlaps.
function paintSet(weekSets, fromRaw, toRaw, id) {
    const r = weekRange(fromRaw, toRaw); if (!r) return;
    for (let i = r[0]; i <= r[1]; i++) weekSets[i].add(id);
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

    // Egne = distinct allocated persons PRESENT (not absent) per week.
    // Build per-week sets of allocated resources, then subtract those absent.
    // (Counting persons, not allocation rows, so absence-matching is meaningful.)
    const allocByWeek = Array.from({ length: N }, () => new Set());
    safeGet(ns.data.allocation).forEach(a => {
        if (!inScope(a.project)) return;
        const aWt = toInt(a.workType);
        if (wt !== null && aWt !== null && aWt !== wt) return;
        const rid = resolveId(a.resource);
        if (rid == null) return;
        paintSet(allocByWeek, a.dateFrom, a.dateTo, rid);
    });

    // Absence is person-global (no project/workType) — absent in a week removes
    // that resource from Egne for every allocation that week.
    const absentByWeek = Array.from({ length: N }, () => new Set());
    safeGet(ns.data.absence).forEach(ab => {
        const rid = resolveId(ab.resource);
        if (rid == null) return;
        paintSet(absentByWeek, ab.dateFrom, ab.dateTo, rid);
    });

    for (let i = 0; i < N; i++) {
        let present = 0;
        allocByWeek[i].forEach(rid => { if (!absentByWeek[i].has(rid)) present++; });
        out.egne[i] = present;
    }

    // Derive Udekt / Overskudd per week
    for (let i = 0; i < N; i++) {
        const diff = out.behov[i] - out.egne[i] - out.innleide[i];
        out.udekt[i]     = Math.max(0, diff);
        out.overskudd[i] = Math.max(0, -diff);
    }
    return out;
}

// ═══ 6. WORK-TYPE FILTER (custom dropdown) ════════════════════════════════════
// Only list work types that actually appear in the active projects' requirements.
// Rebuilds the menu options; keeps the current selection if it still applies,
// otherwise falls back to "Alle arbeidstyper".
function buildFilterOptions() {
    const menu = ns.element.querySelector('#wt-menu');
    if (!menu) return;

    const activeIds = new Set(safeGet(ns.data.projects).map(p => p._id || p.id));
    const used = new Set();
    safeGet(ns.data.projectRequirements).forEach(r => {
        if (activeIds.size && !activeIds.has(resolveId(r.project))) return;
        const v = toInt(r.workType);
        if (v != null) used.add(v);
    });

    const opts = [{ value: '', label: 'Alle arbeidstyper' }];
    safeGet(ns.data.workType).forEach(item => {
        const v = toInt(item?.enum_value);
        if (v == null || !used.has(v)) return;
        opts.push({ value: String(v), label: item.enum_name || String(v) });
    });

    // Selection no longer valid → reset to all.
    if (selectedWT && !opts.some(o => o.value === selectedWT)) selectedWT = '';

    menu.innerHTML = '';
    opts.forEach(o => {
        const li = document.createElement('li');
        li.className = 'wt-option';
        li.setAttribute('role', 'option');
        li.dataset.value = o.value;
        li.textContent = o.label;
        if (o.value === selectedWT) li.setAttribute('aria-selected', 'true');
        menu.appendChild(li);
    });
    syncFilterLabel(opts);
}

function syncFilterLabel(opts) {
    const label = ns.element.querySelector('#wt-label');
    if (!label) return;
    const cur = opts.find(o => o.value === selectedWT);
    label.textContent = cur ? cur.label : 'Alle arbeidstyper';
}

function openMenu()  { setMenuOpen(true); }
function closeMenu() { setMenuOpen(false); }
function setMenuOpen(open) {
    const menu    = /** @type {HTMLElement|null} */ (ns.element.querySelector('#wt-menu'));
    const trigger = /** @type {HTMLElement|null} */ (ns.element.querySelector('#wt-trigger'));
    if (!menu || !trigger) return;
    menu.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
}

// ═══ 7. CHART ═════════════════════════════════════════════════════════════════
// Drop trailing weeks with no data at all, so the axis isn't padded with blanks
// when the view window overshoots the requirements. Keeps at least one week.
function trimTrailingEmpty(labels, data) {
    const keys = ['behov', 'egne', 'innleide', 'utleide', 'udekt', 'overskudd'];
    let last = labels.length - 1;
    while (last > 0 && keys.every(k => !data[k][last])) last--;
    if (last === labels.length - 1) return { labels, data };
    const end = last + 1;
    const out = {};
    keys.forEach(k => { out[k] = data[k].slice(0, end); });
    return { labels: labels.slice(0, end), data: out };
}

function renderChart() {
    buildWeeks();
    if (!weeks.length) return;

    const full = aggregate(selectedWT);
    const view = trimTrailingEmpty(weeks.map(w => w.label), full);
    const { labels, data } = view;
    lastView = view;

    // Series order is fixed and must match `colors`, stroke/marker arrays, and
    // legend marker shapes below. Columns come first and CONTIGUOUS so ApexCharts
    // stacks them; the Behov line is last so it draws on top of the bars. Behov is
    // pulled to the leftmost legend slot via `legend.inverseOrder` (which flips
    // only the legend display order, not the stack/draw order).
    const series = [
        { name: 'Egne ansatte', type: 'column', data: data.egne },
        { name: 'Innleide',     type: 'column', data: data.innleide },
        { name: 'Utleide',      type: 'column', data: data.utleide },
        { name: 'Udekt behov',  type: 'column', data: data.udekt },
        { name: 'Overskudd',    type: 'column', data: data.overskudd },
        { name: 'Behov',        type: 'line',   data: data.behov }
    ];

    // Update in place when the chart already exists — avoids destroy/recreate
    // flicker and keeps ApexCharts' transition animations on data change.
    if (chartInstance) {
        chartInstance.updateOptions({ series, xaxis: { categories: labels } }, false, true);
        return;
    }

    const el = ns.element.querySelector('#resourceChart');
    if (!el) return;

    chartInstance = new ApexCharts(el, {
        series,
        chart: {
            type: 'line', height: '100%', stacked: true,
            fontFamily: 'Lato, sans-serif',
            toolbar: { show: false }, zoom: { enabled: false },
            // Place the shared tooltip just to the side of the hovered column
            // (ApexCharts has no per-point position) — see placeTooltip.
            events: {
                dataPointMouseEnter: (e, ctx, opts) => placeTooltip(ctx, opts.dataPointIndex),
                mouseMove: (e, ctx, opts) => { if (opts && opts.dataPointIndex >= 0) placeTooltip(ctx, opts.dataPointIndex); }
            }
        },
        // Don't lighten/recolour the hovered column — only the tooltip should react.
        states: { hover: { filter: { type: 'none' } }, active: { filter: { type: 'none' } } },
        colors: [COLORS.egne, COLORS.innleide, COLORS.utleide, COLORS.udekt, COLORS.overskudd, COLORS.behov],
        plotOptions: { bar: { columnWidth: '70%', borderRadius: 0 } },
        // Per-series (Behov last): the columns have no stroke/marker; Behov is a
        // 2.5px smooth line with solid black circle dots (strokeWidth 0 drops
        // ApexCharts' default white ring, so the circles read as "hele svarte
        // sirkler").
        stroke: { width: [0, 0, 0, 0, 0, 2.5], curve: 'smooth' },
        markers: { size: [0, 0, 0, 0, 0, 5], strokeWidth: 0, hover: { sizeOffset: 2 } },
        dataLabels: { enabled: false },
        // ApexCharts dilutes fills to 0.85 by default, which washes the bars out
        // vs the planner's solid spans — render the --rp-*-bar colours at full
        // strength so the two views match.
        fill: { opacity: 1 },
        xaxis: {
            categories: labels,
            axisBorder: { color: 'rgb(157,178,189)' },
            axisTicks: { color: 'rgb(157,178,189)' },
            labels: { style: { colors: 'rgb(77,100,112)', fontSize: '11px' } }
        },
        yaxis: {
            min: 0, forceNiceScale: true,
            labels: {
                formatter: (v) => String(Math.round(v)),
                style: { colors: 'rgb(77,100,112)', fontSize: '11px' }
            }
        },
        grid: {
            borderColor: 'rgba(157,178,189,0.3)',
            xaxis: { lines: { show: false } },
            yaxis: { lines: { show: true } }
        },
        legend: {
            position: 'top', horizontalAlign: 'left', fontSize: '12px', offsetY: 4,
            // inverseOrder pulls Behov (last series, drawn on top) to the leftmost
            // legend slot without disturbing the stack/draw order.
            inverseOrder: true,
            labels: { colors: 'rgb(31,41,46)' },
            // Behov (last series) a solid circle matching the graph dots in size (5)
            // and design (filled, no stroke ring); the columns render square swatches.
            markers: { shape: ['square', 'square', 'square', 'square', 'square', 'circle'], size: 5, strokeWidth: 0 },
            onItemClick: { toggleDataSeries: true }
        },
        tooltip: { shared: true, intersect: false, custom: renderTooltip }
    });
    chartInstance.render();
}

// Per-week values aren't carried in the ApexCharts hover payload reliably for a
// stacked+line mix, so read straight from `lastView.data` (what's on screen).
// Rows skip zero values — same as the old Chart.js `label` callback returning
// null — then a footer surfaces demand vs. covered, since the stacked total
// isn't itself a meaningful number.
// Pin the shared tooltip just beside the hovered column, flipping to whichever
// side has room (left half of the plot → tooltip on the right, and vice versa)
// so it never covers the bar being read. Uses ApexCharts layout globals
// (gridWidth/translateX) — undocumented, so verify visually.
function placeTooltip(ctx, i) {
    const w = ctx && ctx.w;
    if (!w) return;
    const n = (lastView && lastView.labels.length) || (w.globals.labels && w.globals.labels.length);
    if (i == null || i < 0 || !n) return;
    const tt = w.globals.dom.baseEl.querySelector('.apexcharts-tooltip');
    if (!tt) return;
    const pointW = w.globals.gridWidth / n;
    const colX   = w.globals.translateX + pointW * (i + 0.5);
    const gap    = 12;
    const x = i < n / 2 ? colX + gap : colX - gap - tt.offsetWidth;
    tt.style.left = Math.max(4, x) + 'px';
    tt.style.top  = '12px';
}

// Only the five stacked sources get a row — Behov is the demand reference line,
// not a stacked component, so it lives in the footer (Behov / Dekket) instead.
const SERIES_META = [
    { key: 'egne',      label: 'Egne ansatte', color: COLORS.egne },
    { key: 'innleide',  label: 'Innleide',     color: COLORS.innleide },
    { key: 'utleide',   label: 'Utleide',      color: COLORS.utleide },
    { key: 'udekt',     label: 'Udekt behov',  color: COLORS.udekt },
    { key: 'overskudd', label: 'Overskudd',    color: COLORS.overskudd }
];

function renderTooltip({ dataPointIndex }) {
    if (!lastView) return '';
    const d = lastView.data;
    const i = dataPointIndex;
    const title = lastView.labels[i] || '';

    const rows = SERIES_META
        .filter(s => d[s.key][i])
        .map(s =>
            '<div class="rg-tt-row">' +
              '<span class="rg-tt-dot" style="background:' + s.color + '"></span>' +
              '<span class="rg-tt-label">' + s.label + '</span>' +
              '<span class="rg-tt-val">' + d[s.key][i] + '</span>' +
            '</div>'
        ).join('');

    const footer = 'Behov: ' + d.behov[i] + '  ·  Dekket: ' + (d.egne[i] + d.innleide[i]);

    return '<div class="rg-tt">' +
             '<div class="rg-tt-title">' + title + '</div>' +
             rows +
             '<div class="rg-tt-footer">' + footer + '</div>' +
           '</div>';
}

// ═══ 8. LIFECYCLE ═════════════════════════════════════════════════════════════
function refresh() {
    buildFilterOptions();
    renderChart();
}

function init() {
    buildFilterOptions();
    renderChart();

    const trigger = /** @type {HTMLElement|null} */ (ns.element.querySelector('#wt-trigger'));
    const menu    = /** @type {HTMLElement|null} */ (ns.element.querySelector('#wt-menu'));

    trigger?.addEventListener('click', (e) => {
        e.stopPropagation();
        menu && menu.hidden ? openMenu() : closeMenu();
    });

    // Event-delegated option pick — menu contents are rebuilt on every refresh.
    menu?.addEventListener('click', (e) => {
        const target = /** @type {HTMLElement} */ (e.target);
        const li = /** @type {HTMLElement|null} */ (target.closest('.wt-option'));
        if (!li) return;
        selectedWT = li.dataset.value || '';
        buildFilterOptions();   // refresh labels + aria-selected
        closeMenu();
        renderChart();
    });

    // Close on outside click / Escape.
    document.addEventListener('click', closeMenu);
    ns.element.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

    ['projectRequirements', 'allocation', 'absence', 'projects', 'workTypeEnum', 'viewFrom', 'viewTo']
        .forEach(name => ns.data[name]?.on?.('change', refresh));

    ns.on?.('unload', () => {
        document.removeEventListener('click', closeMenu);
        if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    });
}

if (document.readyState === 'complete' || document.readyState === 'interactive') init();
else document.addEventListener('DOMContentLoaded', init);
