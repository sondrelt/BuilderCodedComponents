// Mock data for resource-req-phasingOut (week-grid). resourceReq rows are keyed
// by project_source_workType_week; week is a plain week NUMBER matching weeks[].
// resourceAggregated left empty → the component's internal aggregate path runs.
window.FIXTURES = window.FIXTURES || {};

const weekNums = [24, 25, 26, 27, 28, 29, 30, 31];

const projWT = [
  { project: 'p1', workType: 250 }, // Tømrer
  { project: 'p1', workType: 20 },  // Betong
  { project: 'p2', workType: 190 }, // Rørlegger
];

// Behov(10)/Egne(20)/Innleide(30) per project-worktype-week; udekt/overskudd derived.
const SPLIT = { 10: 5, 20: 3, 30: 1 };
const resourceReq = [];
let n = 0;
projWT.forEach((pw) => {
  weekNums.forEach((week) => {
    Object.entries(SPLIT).forEach(([source, count]) => {
      resourceReq.push({
        _id: 'rq' + n++,
        project: pw.project,
        workType: pw.workType,
        source: Number(source),
        week,
        resourceCountNeed: count,
      });
    });
  });
});

window.FIXTURES['resource-req-phasingOut'] = {
  calendarWeekWidthPixel: 60,
  weeks: weekNums.map((weekNumber) => ({ weekNumber })),
  source: [
    { enum_value: 10, enum_name: 'Behov' },
    { enum_value: 20, enum_name: 'Egne' },
    { enum_value: 30, enum_name: 'Innleide' },
    { enum_value: 40, enum_name: 'Udekt' },
    { enum_value: 50, enum_name: 'Overskudd' },
  ],
  workTypeEnum: [
    { enum_value: 250, enum_name: 'Tømrer' },
    { enum_value: 20, enum_name: 'Betong' },
    { enum_value: 190, enum_name: 'Rørlegger' },
  ],
  projects: [
    { _id: 'p1', name: 'Nytt Sykehus', colorHexCode: '#88c8ed' },
    { _id: 'p2', name: 'Boligfelt Vest', colorHexCode: '#b5cfaa' },
  ],
  projectWorkType: projWT.map((pw, i) => ({ _id: 'pwt' + i, ...pw })),
  resourceReq,
  resourceAggregated: [],
};
