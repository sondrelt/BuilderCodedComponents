// Mock data for resource-graph-v2 (ApexCharts). Same record shapes as
// resource-req-v2. NOTE: this component reads ns.data.workType (not workTypeEnum
// as component.json lists) for its filter — key the enum under `workType`.
window.FIXTURES = window.FIXTURES || {};

window.FIXTURES['resource-graph-v2'] = {
  viewFrom: '2026-06-01',
  viewTo: '2026-08-23',

  workType: [
    { enum_value: 250, enum_name: 'Tømrer' },
    { enum_value: 190, enum_name: 'Rørlegger' },
  ],

  projects: [
    { _id: 'p1', name: 'Nytt Sykehus' },
    { _id: 'p2', name: 'Boligfelt Vest' },
  ],

  // Behov demand (source 10) per work type.
  projectRequirements: [
    { _id: 'r1', project: 'p1', source: 10, workType: 250, resourceCount: 5, dateFrom: '2026-06-08', dateTo: '2026-07-26' },
    { _id: 'r2', project: 'p2', source: 10, workType: 190, resourceCount: 3, dateFrom: '2026-06-01', dateTo: '2026-08-09' },
  ],

  // Allocated persons → Egne; spread so weekly counts vary.
  allocation: [
    { _id: 'a1', project: 'p1', resource: 'res1', workType: 250, dateFrom: '2026-06-08', dateTo: '2026-07-26' },
    { _id: 'a2', project: 'p1', resource: 'res2', workType: 250, dateFrom: '2026-06-15', dateTo: '2026-07-26' },
    { _id: 'a3', project: 'p1', resource: 'res3', workType: 250, dateFrom: '2026-06-22', dateTo: '2026-07-12' },
    { _id: 'a4', project: 'p2', resource: 'res4', workType: 190, dateFrom: '2026-06-01', dateTo: '2026-08-09' },
  ],

  absence: [
    { _id: 'ab1', resource: 'res1', dateFrom: '2026-06-29', dateTo: '2026-07-05' },
  ],
};
