const ns = appfarm;
let chartInstance = null;

const COLORS = {
  behov: 'rgb(31,41,46)',
  egne: 'rgb(149,187,134)',
  innleide: 'rgb(78,173,228)',
  utleide: 'rgb(252,207,151)',
  udekt: 'rgb(214,116,113)',
  overskudd: 'rgb(87,128,71)'
};

// Source enum integer values fra Resource Need Source (4iBMPN)
const SOURCE = { BEHOV: 10, EGNE: 20, INNLEIDE: 30, UTLEIDE: 35, UDEKT: 40, OVERSKUDD: 50 };

function populateWorkTypeFilter() {
  var select = ns.element.querySelector('#work-type-filter');
  if (!select) return;

  var activeProjects = ns.data.projects.get() || [];
  var activeProjIds = activeProjects.map(function(p) { return p.id || p._id; });
  var perProjectData = appfarm.data.perProjectData.get() || [];
  var allWorkTypes = ns.data.workTypes.get() || [];

  var usedWorkTypeValues = [];
  perProjectData.forEach(function(item) {
    var itemProjId = item.project && (item.project.id || item.project._id || item.project);

    if (activeProjIds.length === 0 || activeProjIds.includes(itemProjId)) {
      if (item.workType) {
        var wtVal = typeof item.workType === 'object'
          ? (item.workType.enum_value || item.workType.value || item.workType.id)
          : item.workType;

        if (wtVal && !usedWorkTypeValues.includes(wtVal)) {
          usedWorkTypeValues.push(wtVal);
        }
      }
    }
  });

  while (select.options.length > 0) select.remove(0);

  var defaultOpt = document.createElement('option');
  defaultOpt.value = "";
  defaultOpt.textContent = "Alle arbeidstyper";
  select.appendChild(defaultOpt);

  allWorkTypes.forEach(function(wt) {
    if (usedWorkTypeValues.includes(wt.enum_value)) {
      var opt = document.createElement('option');
      opt.value = wt.enum_value;
      opt.textContent = wt.enum_name;
      select.appendChild(opt);
    }
  });
}

function getSum(data, weekNum, sourceVal, activeProjIds, selectedWorkType) {
  return data
    .filter(function(d) {
      const dWeek = d.weekNumber !== undefined ? d.weekNumber : d.week;
      if (dWeek !== weekNum) return false;

      const dSource = d.source && (typeof d.source === 'object' ? d.source.enum_value : d.source);
      if (dSource != sourceVal) return false;

      if (activeProjIds && activeProjIds.length > 0) {
        const dProjId = d.project && (typeof d.project === 'object' ? (d.project.id || d.project._id) : d.project);
        if (!activeProjIds.includes(dProjId)) return false;
      }

      if (selectedWorkType) {
        const dWorkType = d.workType && (typeof d.workType === 'object' ? (d.workType.enum_value || d.workType.value || d.workType.id) : d.workType);
        if (dWorkType != selectedWorkType) return false;
      }

      return true;
    })
    .reduce(function(sum, d) { return sum + (d.resourceCountNeed || 0); }, 0);
}

function renderLegend() {
  const legendContainer = ns.element.querySelector('#chartLegend');
  const filterSelect = ns.element.querySelector('#work-type-filter');
  if (!legendContainer) return;

  legendContainer.style.display = 'flex';
  legendContainer.style.alignItems = 'center';
  legendContainer.style.gap = '16px';
  legendContainer.style.width = '100%';
  legendContainer.innerHTML = '';

  const legendItems = [
    { label: 'Egne ansatte', color: COLORS.egne, type: 'box' },
    { label: 'Innleide', color: COLORS.innleide, type: 'box' },
    { label: 'Utleide', color: COLORS.utleide, type: 'box' },
    { label: 'Udekt behov', color: COLORS.udekt, type: 'box' },
    { label: 'Overskudd', color: COLORS.overskudd, type: 'box' },
    { label: 'Behov', color: COLORS.behov, type: 'line' }
  ];

  legendItems.forEach(item => {
    const itemDiv = document.createElement('div');
    itemDiv.style.display = 'flex';
    itemDiv.style.alignItems = 'center';
    itemDiv.style.gap = '6px';
    itemDiv.style.fontSize = '12px';
    itemDiv.style.fontFamily = 'Lato, sans-serif';
    itemDiv.style.color = 'rgb(31,41,46)';

    const indicator = document.createElement('div');
    if (item.type === 'line') {
      indicator.style.width = '16px';
      indicator.style.height = '3px';
    } else {
      indicator.style.width = '12px';
      indicator.style.height = '12px';
      indicator.style.borderRadius = '2px';
    }
    indicator.style.background = item.color;

    itemDiv.appendChild(indicator);
    itemDiv.appendChild(document.createTextNode(item.label));
    legendContainer.appendChild(itemDiv);
  });

  if (filterSelect) {
    filterSelect.style.marginLeft = 'auto';
    filterSelect.style.padding = '4px 8px';
    filterSelect.style.borderRadius = '4px';
    filterSelect.style.border = '1px solid rgb(190, 205, 212)';
    filterSelect.style.backgroundColor = '#fff';
    filterSelect.style.fontFamily = 'Lato, sans-serif';
    filterSelect.style.fontSize = '12px';
    filterSelect.style.color = 'rgb(31,41,46)';
    filterSelect.style.cursor = 'pointer';
    filterSelect.style.outline = 'none';

    legendContainer.appendChild(filterSelect);
  }
}

function renderChart() {
  var weeks = ns.data.calendarWeeks.get() || [];
  var perProjectData = ns.data.perProjectData.get() || [];

  var filterSelect = ns.element.querySelector('#work-type-filter');
  var selectedWorkType = filterSelect ? filterSelect.value : "";

  var projectFilterData = ns.data.projects.get() || [];
  var activeProjIds = projectFilterData.map(function(p) { return p.id || p._id; });

  if (!weeks.length) return;

  var labels = weeks.map(function(w) { return 'Uke ' + w.weekNumber; });

  var behovData     = weeks.map(function(w) { return getSum(perProjectData, w.weekNumber, SOURCE.BEHOV,      activeProjIds, selectedWorkType); });
  var egneData      = weeks.map(function(w) { return getSum(perProjectData, w.weekNumber, SOURCE.EGNE,       activeProjIds, selectedWorkType); });
  var innleideData  = weeks.map(function(w) { return getSum(perProjectData, w.weekNumber, SOURCE.INNLEIDE,   activeProjIds, selectedWorkType); });
  var utleideData   = weeks.map(function(w) { return getSum(perProjectData, w.weekNumber, SOURCE.UTLEIDE,    activeProjIds, selectedWorkType); });
  var udektData     = weeks.map(function(w) { return Math.max(0, getSum(perProjectData, w.weekNumber, SOURCE.UDEKT,      activeProjIds, selectedWorkType)); });
  var overskuddData = weeks.map(function(w) { return Math.max(0, getSum(perProjectData, w.weekNumber, SOURCE.OVERSKUDD,  activeProjIds, selectedWorkType)); });

  var canvas = ns.element.querySelector('#resourceChart');
  if (!canvas) return;

  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  var ctx = canvas.getContext('2d');

  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        { label: 'Egne ansatte', data: egneData,      backgroundColor: COLORS.egne,       stack: 'stack1', order: 3, borderRadius: 2, barPercentage: 0.7, categoryPercentage: 0.8 },
        { label: 'Innleide',     data: innleideData,   backgroundColor: COLORS.innleide,   stack: 'stack1', order: 3, borderRadius: 2, barPercentage: 0.7, categoryPercentage: 0.8 },
        { label: 'Utleide',      data: utleideData,    backgroundColor: COLORS.utleide,    stack: 'stack1', order: 3, borderRadius: 2, barPercentage: 0.7, categoryPercentage: 0.8 },
        { label: 'Udekt behov',  data: udektData,      backgroundColor: COLORS.udekt,      stack: 'stack1', order: 3, borderRadius: 2, barPercentage: 0.7, categoryPercentage: 0.8 },
        { label: 'Overskudd',    data: overskuddData,  backgroundColor: COLORS.overskudd,  stack: 'stack1', order: 3, borderRadius: 2, barPercentage: 0.7, categoryPercentage: 0.8 },
        { label: 'Behov', data: behovData, type: 'line', borderColor: COLORS.behov, backgroundColor: 'transparent',
          pointBackgroundColor: COLORS.behov, pointRadius: 4, pointHoverRadius: 6,
          borderWidth: 2.5, tension: 0.25, order: 1, fill: false }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgb(31,41,46)',
          titleFont: { family: 'Lato', size: 13, weight: '600' },
          bodyFont: { family: 'Lato', size: 12 },
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            label: function(context) {
              var val = context.parsed.y;
              if (val === 0 || val === null || val === undefined) return null;
              return context.dataset.label + ': ' + val;
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

function init() {
  populateWorkTypeFilter();
  renderLegend();
  renderChart();

  var filterSelect = ns.element.querySelector('#work-type-filter');
  filterSelect?.addEventListener('change', renderChart);

  ns.data.calendarWeeks.on('change', renderChart);

  ns.data.perProjectData.on('change', function() {
    populateWorkTypeFilter();
    renderLegend();
    renderChart();
  });

  ns.data.projects.on('change', function() {
    populateWorkTypeFilter();
    renderLegend();
    renderChart();
  });

  ns.data.workTypes.on('change', function() {
    populateWorkTypeFilter();
    renderLegend();
    renderChart();
  });
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  init();
} else {
  document.addEventListener('DOMContentLoaded', init);
}
