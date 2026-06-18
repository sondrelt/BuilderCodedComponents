// --- Resource Planning Grid - Multi-Project Rendering ---

var SOURCE_COLORS = {
    10: 'behov',
    20: 'egne',
    30: 'innleide',
    35: 'utleide',
    40: 'udekt',
    50: 'overskudd'
};
var POPOVER_SOURCES = [40, 50, 35, 30];

var DERIVED_SOURCES = [40, 50];
var EDITABLE_SOURCES = [10, 30, 35];

var pendingChanges = {};
var hasPendingChanges = false;
var activeEdit = false;
var focusedInputKey = null;

function saveFocusKey(key) {
    focusedInputKey = key;
    try { sessionStorage.setItem('_gridFocusKey', key || ''); } catch (e) {}
}

function loadFocusKey() {
    if (focusedInputKey) return focusedInputKey;
    try { return sessionStorage.getItem('_gridFocusKey') || null; } catch (e) { return null; }
}

function getSourceClass(enumVal) {
    return SOURCE_COLORS[enumVal] || 'behov';
}

function buildWorkTypeNameMap() {
    var wtEnumItems = appfarm.data.workTypeEnum.get() || [];
    var map = {};
    wtEnumItems.forEach(function (item) {
        if (item && item.enum_value != null) {
            map[item.enum_value] = item.enum_name || 'Unknown';
        }
    });
    return map;
}

function computeInternalAggregates() {
    var allReq = appfarm.data.resourceReq.get() || [];
    var valueMap = {};

    // Baseline database states
    allReq.forEach(function (r) {
        var projId = (r.project && typeof r.project === 'object') ? r.project._id : r.project;
        var key = String(projId) + '_' + r.source + '_' + r.workType + '_' + r.week;
        valueMap[key] = (r.resourceCountNeed != null) ? Number(r.resourceCountNeed) : 0;
    });

    // Overlay active UI modifications
    Object.keys(pendingChanges).forEach(function (changeKey) {
        var change = pendingChanges[changeKey];
        var key = String(change.projectId) + '_' + change.sourceEnum + '_' + change.workType + '_' + change.week;
        valueMap[key] = change.value;
    });

    var aggMap = {
        headers: {},
        details: {}
    };

    var allProjects = appfarm.data.projects.get() || [];
    var weeks = appfarm.data.weeks.get() || [];
    var allWorkTypes = appfarm.data.projectWorkType.get() || [];

    allProjects.forEach(function (project) {
        var projId = String(project._id);
        var projectWorkTypes = allWorkTypes.filter(function (wt) {
            return String(wt.project) === projId;
        });

        weeks.forEach(function (week) {
            var wk = week.weekNumber;
            var totalUdekt = 0;
            var totalOverskudd = 0;

            projectWorkTypes.forEach(function (wt) {
                var wtId = wt.workType;

                var behov     = valueMap[projId + '_10_' + wtId + '_' + wk] || 0;
                var egne      = valueMap[projId + '_20_' + wtId + '_' + wk] || 0;
                var innleide  = valueMap[projId + '_30_' + wtId + '_' + wk] || 0;

                var diff = behov - egne - innleide;

                var wtUdekt     = Math.max(0, diff);
                var wtOverskudd = Math.max(0, -diff);

                aggMap.details[projId + '_40_' + wtId + '_' + wk] = wtUdekt;
                aggMap.details[projId + '_50_' + wtId + '_' + wk] = wtOverskudd;

                totalUdekt     += wtUdekt;
                totalOverskudd += wtOverskudd;

                aggMap.headers[projId + '_10_' + wk] = (aggMap.headers[projId + '_10_' + wk] || 0) + behov;
                aggMap.headers[projId + '_20_' + wk] = (aggMap.headers[projId + '_20_' + wk] || 0) + egne;
                aggMap.headers[projId + '_30_' + wk] = (aggMap.headers[projId + '_30_' + wk] || 0) + innleide;
            });

            aggMap.headers[projId + '_40_' + wk] = totalUdekt;
            aggMap.headers[projId + '_50_' + wk] = totalOverskudd;
        });
    });

    return aggMap;
}

function patchAggregatedValuesFromInternal() {
    var aggData = computeInternalAggregates();

    var cells = document.querySelectorAll('#grid-root .ag-cell[data-proj][data-src][data-wk]');
    cells.forEach(function (cell) {
        var projId = cell.getAttribute('data-proj');
        var src    = parseInt(cell.getAttribute('data-src'), 10);
        var wk     = parseInt(cell.getAttribute('data-wk'), 10);
        var aggKey = projId + '_' + src + '_' + wk;
        var valSpan = cell.querySelector('span');
        if (valSpan) {
            valSpan.textContent = aggData.headers[aggKey] != null ? aggData.headers[aggKey] : 0;
        }
    });

    var detailInputs = document.querySelectorAll('#grid-root .cell-input[data-src-enum="40"], #grid-root .cell-input[data-src-enum="50"]');
    detailInputs.forEach(function (input) {
        var projId    = input.getAttribute('data-proj');
        var src       = input.getAttribute('data-src-enum');
        var wt        = input.getAttribute('data-wt');
        var wk        = input.getAttribute('data-wk');
        var detailKey = projId + '_' + src + '_' + wt + '_' + wk;

        if (aggData.details[detailKey] != null) {
            input.value = aggData.details[detailKey];
        }
    });
}

function patchAggregatedValuesFromAppfarm() {
    var allAg = appfarm.data.resourceAggregated.get() || [];
    var cells = document.querySelectorAll('#grid-root .ag-cell[data-proj][data-src][data-wk]');
    cells.forEach(function (cell) {
        var projId = cell.getAttribute('data-proj');
        var src    = parseInt(cell.getAttribute('data-src'), 10);
        var wk     = parseInt(cell.getAttribute('data-wk'), 10);
        var agObj  = allAg.find(function (a) {
            var aProjId = (a.project && typeof a.project === 'object') ? a.project._id : a.project;
            return String(aProjId) === String(projId) && Number(a.source) === src && Number(a.week) === wk;
        });
        var valSpan = cell.querySelector('span');
        if (valSpan && agObj && agObj.resourceCountNeed != null) {
            valSpan.textContent = agObj.resourceCountNeed;
        }
    });
    patchAggregatedValuesFromInternal();
}

function buildGrid() {
    var root = document.getElementById('grid-root');
    if (!root || activeEdit) return;

    var keyToRestore = loadFocusKey();
    root.innerHTML = '';

    var weeks      = appfarm.data.weeks.get() || [];
    var sources    = appfarm.data.source.get() || [];
    var allReq     = appfarm.data.resourceReq.get() || [];
    var allProjects = appfarm.data.projects.get() || [];
    var allWorkTypes = appfarm.data.projectWorkType.get() || [];
    var colWidth   = appfarm.data.calendarWeekWidthPixel.get() || 60;
    var wtNameMap  = buildWorkTypeNameMap();

    if (!allProjects.length) return;

    var reqMap = {};
    allReq.forEach(function (r) {
        var projId = (r.project && typeof r.project === 'object') ? r.project._id : r.project;
        var key = String(projId) + '_' + r.source + '_' + r.workType + '_' + r.week;
        reqMap[key] = r;
    });

    var aggMap = computeInternalAggregates();

    allProjects.forEach(function (project) {
        var projectId   = project._id;
        var showDetails = !!project.detailsShowBOL;

        var headerRow = document.createElement('div');
        headerRow.className = 'project-header-row';

        var actionsDiv = document.createElement('div');
        actionsDiv.className = 'project-actions';

        var toggleBtn = document.createElement('button');
        toggleBtn.className = 'project-action-btn mdi ' + (showDetails ? 'mdi-chevron-up' : 'mdi-chevron-down');
        toggleBtn.addEventListener('click', function (e) {
            appfarm.actions.toggleDetails({ projectId: projectId }, { event: e });
        });
        actionsDiv.appendChild(toggleBtn);

        var editBtn = document.createElement('button');
        editBtn.className = 'project-action-btn mdi mdi-pencil';
        editBtn.addEventListener('click', function (e) {
            appfarm.actions.editProject({ projectId: projectId, actionType: '650aa3b1d1c9cc35ddc3cc6f' }, { event: e });
        });
        actionsDiv.appendChild(editBtn);

        var graphBtn = document.createElement('button');
        graphBtn.className = 'project-action-btn mdi mdi-chart-bar';
        graphBtn.title = 'Vis graf';
        graphBtn.addEventListener('click', function (e) {
            appfarm.actions.openGraph({ projectId: projectId }, { event: e });
        });
        actionsDiv.appendChild(graphBtn);

        var nameSpan = document.createElement('span');
        nameSpan.className = 'project-header-name';
        nameSpan.textContent = project.name || 'Prosjekt';
        actionsDiv.appendChild(nameSpan);

        headerRow.appendChild(actionsDiv);
        root.appendChild(headerRow);

        var projectWorkTypes = allWorkTypes.filter(function (wt) {
            return wt.project === projectId;
        });

        sources.forEach(function (src) {
            var srcEnumVal = src.enum_value;
            var srcClass   = getSourceClass(srcEnumVal);
            var group      = document.createElement('div');
            group.className = 'source-group';

            var headerRowSrc = document.createElement('div');
            headerRowSrc.className = 'source-header-row';

            var label = document.createElement('div');
            label.className = 'source-label source-label-' + srcClass;
            label.textContent = src.enum_name || '';
            headerRowSrc.appendChild(label);

            var agWeeksRow = document.createElement('div');
            agWeeksRow.className = 'ag-weeks-row';

            weeks.forEach(function (week, wIdx) {
                var aggKey = String(projectId) + '_' + srcEnumVal + '_' + week.weekNumber;
                var cell   = document.createElement('div');
                cell.className = 'ag-cell ag-cell-' + srcClass;
                cell.style.width = colWidth + 'px';
                cell.setAttribute('data-proj', projectId);
                cell.setAttribute('data-src', srcEnumVal);
                cell.setAttribute('data-wk', week.weekNumber);

                var valSpan = document.createElement('span');
                valSpan.textContent = aggMap.headers[aggKey] != null ? aggMap.headers[aggKey] : 0;
                cell.appendChild(valSpan);

                if (wIdx === weeks.length - 1 && POPOVER_SOURCES.indexOf(srcEnumVal) >= 0) {
                    var btn = document.createElement('button');
                    btn.className = 'ag-magnify mdi mdi-magnify';
                    btn.addEventListener('click', function (e) {
                        appfarm.actions.viewBuilderAds({ source: srcEnumVal, projectId: projectId }, { event: e });
                    });
                    cell.appendChild(btn);
                }
                agWeeksRow.appendChild(cell);
            });

            headerRowSrc.appendChild(agWeeksRow);
            group.appendChild(headerRowSrc);

            if (showDetails) {
                projectWorkTypes.forEach(function (wt) {
                    var wtEnumInt = wt.workType;
                    var wtRow     = document.createElement('div');
                    wtRow.className = 'wt-row';

                    var wtLabel = document.createElement('div');
                    wtLabel.className = 'wt-label';
                    wtLabel.textContent = wtNameMap[wtEnumInt] || String(wtEnumInt);
                    wtRow.appendChild(wtLabel);

                    var wtWeeksRow = document.createElement('div');
                    wtWeeksRow.className = 'wt-weeks-row';

                    weeks.forEach(function (week) {
                        var weekNum = week.weekNumber;
                        var reqKey  = String(projectId) + '_' + srcEnumVal + '_' + wtEnumInt + '_' + weekNum;
                        var reqObj  = reqMap[reqKey];

                        var cell = document.createElement('div');
                        cell.className = 'wt-cell';
                        cell.style.width = colWidth + 'px';

                        var input = document.createElement('input');
                        input.type      = 'text';
                        input.inputMode = 'numeric';
                        input.className = 'cell-input';

                        var isReadOnlySource = DERIVED_SOURCES.indexOf(srcEnumVal) >= 0 || srcEnumVal === 20;
                        if (isReadOnlySource) {
                            input.readOnly = true;
                            input.tabIndex = -1;
                            input.classList.add('is-readonly');
                        }

                        var displayVal  = 0;
                        var pendingKey  = String(projectId) + '_' + srcEnumVal + '_' + wtEnumInt + '_' + weekNum;

                        if (pendingChanges[pendingKey] != null) {
                            displayVal = pendingChanges[pendingKey].value;
                        } else if (srcEnumVal === 40 || srcEnumVal === 50) {
                            var detailKey = String(projectId) + '_' + srcEnumVal + '_' + wtEnumInt + '_' + weekNum;
                            displayVal = aggMap.details[detailKey] || 0;
                        } else {
                            displayVal = (reqObj && reqObj.resourceCountNeed != null) ? reqObj.resourceCountNeed : 0;
                        }

                        input.value = displayVal;
                        input.setAttribute('data-req-id',    reqObj ? reqObj._id : '');
                        input.setAttribute('data-proj',      projectId);
                        input.setAttribute('data-src-enum',  srcEnumVal);
                        input.setAttribute('data-wt',        wtEnumInt);
                        input.setAttribute('data-wk',        weekNum);

                        input.addEventListener('focus', function () {
                            var myKey = [
                                this.getAttribute('data-proj'),
                                this.getAttribute('data-src-enum'),
                                this.getAttribute('data-wt'),
                                this.getAttribute('data-wk')
                            ].join('_');
                            saveFocusKey(myKey);
                            this.select();
                            activeEdit = true;
                        });

                        input.addEventListener('input', function () {
                            var newVal  = parseInt(this.value, 10) || 0;
                            var rId     = this.getAttribute('data-req-id');
                            var projId  = this.getAttribute('data-proj');
                            var srcEnum = parseInt(this.getAttribute('data-src-enum'), 10);
                            var wt      = parseInt(this.getAttribute('data-wt'), 10);
                            var wk      = parseInt(this.getAttribute('data-wk'), 10);

                            var changeKey = projId + '_' + srcEnum + '_' + wt + '_' + wk;
                            pendingChanges[changeKey] = {
                                id: rId, projectId: projId, sourceEnum: srcEnum,
                                workType: wt, week: wk, value: newVal
                            };
                            hasPendingChanges = true;
                            activeEdit = true;

                            patchAggregatedValuesFromInternal();

                            if (typeof appfarm.actions.updateResourceReq === 'function') {
                                appfarm.actions.updateResourceReq({ resourceReqId: rId, newValue: newVal });
                            }
                            if (typeof appfarm.actions.startSaveTimer === 'function') {
                                appfarm.actions.startSaveTimer();
                            }
                        });

                        input.addEventListener('blur', function (e) {
                            var newVal = parseInt(this.value, 10) || 0;
                            this.value = newVal;

                            if (!e.relatedTarget || !('classList' in e.relatedTarget) || !e.relatedTarget.classList.contains('cell-input')) {
                                saveFocusKey(null);
                            }
                            activeEdit = false;
                        });

                        input.addEventListener('keydown', function (e) {
                            var allowed = ['Backspace', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Delete', 'Enter'];
                            if (allowed.indexOf(e.key) === -1 && !/^\d$/.test(e.key)) {
                                e.preventDefault();
                            }
                        });

                        cell.appendChild(input);
                        wtWeeksRow.appendChild(cell);
                    });

                    wtRow.appendChild(wtWeeksRow);
                    group.appendChild(wtRow);
                });
            }

            root.appendChild(group);
        });
    });

    setupArrowNavigation();

    if (keyToRestore) {
        var p = keyToRestore.split('_');
        var selector = '.cell-input[data-proj="' + p[0] + '"][data-src-enum="' + p[1] + '"][data-wt="' + p[2] + '"][data-wk="' + p[3] + '"]';
        var target = root.querySelector(selector);
        if (target) setTimeout(function () { target.focus(); }, 10);
    }
}

function setupArrowNavigation() {
    var inputs = Array.from(document.querySelectorAll('#grid-root .cell-input'));
    if (!inputs.length) return;

    var rowMap = [];
    var currentRow = [];
    var lastRowElem = null;

    inputs.forEach(function (inp) {
        var rowElem = inp.closest('.wt-row') || inp.closest('.source-header-row');
        if (rowElem !== lastRowElem) {
            if (currentRow.length) rowMap.push(currentRow);
            currentRow = [];
            lastRowElem = rowElem;
        }
        currentRow.push(inp);
    });
    if (currentRow.length) rowMap.push(currentRow);

    inputs.forEach(function (inp) {
        if (inp.readOnly) return;

        inp.addEventListener('keydown', function (e) {
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.key) === -1) return;

            var r = -1, c = -1;
            for (var ri = 0; ri < rowMap.length; ri++) {
                var ci = rowMap[ri].indexOf(inp);
                if (ci >= 0) { r = ri; c = ci; break; }
            }

            var tr = r, tc = c;
            do {
                if (e.key === 'ArrowUp')        tr--;
                else if (e.key === 'ArrowDown')  tr++;
                else if (e.key === 'ArrowLeft')  tc--;
                else if (e.key === 'ArrowRight') tc++;

                var target = (rowMap[tr] && rowMap[tr][tc]) ? rowMap[tr][tc] : null;
                if (target && !target.readOnly) {
                    e.preventDefault();
                    target.focus();
                    return;
                }
            } while (rowMap[tr] && (tc >= 0 && tc < rowMap[tr].length));
        });
    });
}

function guardedBuildGrid() {
    if (!activeEdit) buildGrid();
}

function init() {
    buildGrid();

    var structuralEvents = ['weeks', 'source', 'projects', 'projectWorkType', 'calendarWeekWidthPixel', 'workTypeEnum'];
    structuralEvents.forEach(function (ev) {
        if (appfarm.data[ev]) appfarm.data[ev].on('change', guardedBuildGrid);
    });

    appfarm.data.resourceReq.on('change', function () {
        if (!activeEdit) buildGrid();
    });

    appfarm.data.resourceAggregated.on('change', function () {
        patchAggregatedValuesFromAppfarm();
    });
}

if (document.readyState === 'complete' || document.readyState === 'interactive') { init(); }
else { document.addEventListener('DOMContentLoaded', init); }
