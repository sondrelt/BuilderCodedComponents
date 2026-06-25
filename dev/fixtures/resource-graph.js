// Mock data for resource-graph (Chart.js bar/line). Source enum_value drives the
// stacked series (10 Behov, 20 Egne, 30 Innleide, 35 Utleide, 40 Udekt, 50 Overskudd).
window.FIXTURES = window.FIXTURES || {};

const weekNums = [24, 25, 26, 27, 28, 29, 30, 31];

// One perProjectData row per (project, workType, source, week). Keep it small:
// project p1 / Tømrer, with a realistic source split each week.
const SPLIT = { 10: 6, 20: 4, 30: 1, 40: 1 }; // behov 6 = egne 4 + innleide 1 + udekt 1
const perProjectData = [];
weekNums.forEach((wk) => {
  Object.entries(SPLIT).forEach(([source, count]) => {
    perProjectData.push({
      project: 'p1',
      workType: 250,
      source: Number(source),
      weekNumber: wk,
      resourceCountNeed: count,
    });
  });
  // a second work type on a second project, lighter
  perProjectData.push({ project: 'p2', workType: 190, source: 10, weekNumber: wk, resourceCountNeed: 3 });
  perProjectData.push({ project: 'p2', workType: 190, source: 20, weekNumber: wk, resourceCountNeed: 2 });
  perProjectData.push({ project: 'p2', workType: 190, source: 50, weekNumber: wk, resourceCountNeed: 1 });
});

window.FIXTURES['resource-graph'] = {
  calendarWeeks: weekNums.map((weekNumber) => ({ weekNumber })),
  perProjectData,
  projects: [
    { _id: 'p1', name: 'Nytt Sykehus' },
    { _id: 'p2', name: 'Boligfelt Vest' },
  ],
  workTypes: [
    { enum_value: 250, enum_name: 'Tømrer' },
    { enum_value: 190, enum_name: 'Rørlegger' },
  ],
};
