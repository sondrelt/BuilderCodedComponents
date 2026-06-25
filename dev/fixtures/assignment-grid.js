// Mock data for assignment-grid (resource × time planner). Resources get
// allocation/absence bars; jobs (open ads) match resources by workType and fill
// free gaps. References use raw id strings (resolveId handles strings).
window.FIXTURES = window.FIXTURES || {};

window.FIXTURES['assignment-grid'] = {
  viewFrom: '2026-06-01',
  viewTo: '2026-08-09',
  viewGranularity: 'week',
  sortByProjects: false,

  workTypeEnum: [
    { enum_value: 250, enum_name: 'Tømrer' },
    { enum_value: 20, enum_name: 'Betong' },
    { enum_value: 190, enum_name: 'Rørlegger' },
  ],

  // Absence Type → colour. absenceValue matches absence.absenceType ids.
  absenceColors: [
    { absenceValue: 20, absenceName: 'Ferie', colorHexCode: '#fddfba' },
    { absenceValue: 40, absenceName: 'Fravær', colorHexCode: '#efc9c8' },
    { absenceValue: 60, absenceName: 'Permittert', colorHexCode: '#b5cfaa' },
    { absenceValue: 80, absenceName: 'Sykemeldt', colorHexCode: '#f7e4e3' },
  ],

  resources: [
    { _id: 'res1', fullNameFx: 'Ola Nordmann', workType: 250, position: 'Tømrer' },
    { _id: 'res2', fullNameFx: 'Kari Hansen', workType: 250, position: 'Tømrer' },
    { _id: 'res3', fullNameFx: 'Per Johansen', workType: 20, position: 'Betongarbeider' },
    { _id: 'res4', fullNameFx: 'Nina Berg', workType: 190, position: 'Rørlegger' },
  ],

  projects: [
    { _id: 'p1', name: 'Nytt Sykehus' },
    { _id: 'p2', name: 'Boligfelt Vest' },
  ],

  allocation: [
    { _id: 'a1', resource: 'res1', project: 'p1', workType: 250, dateFrom: '2026-06-08', dateTo: '2026-07-05' },
    { _id: 'a2', resource: 'res2', project: 'p1', workType: 250, dateFrom: '2026-06-15', dateTo: '2026-07-26' },
    { _id: 'a3', resource: 'res3', project: 'p2', workType: 20, dateFrom: '2026-06-01', dateTo: '2026-06-28' },
    { _id: 'a4', resource: 'res4', project: 'p2', workType: 190, dateFrom: '2026-06-22', dateTo: '2026-08-02' },
  ],

  absence: [
    { _id: 'ab1', resource: 'res1', absenceType: 20, dateFrom: '2026-07-13', dateTo: '2026-07-26' },
    { _id: 'ab2', resource: 'res3', absenceType: 80, dateFrom: '2026-07-06', dateTo: '2026-07-12' },
  ],

  // Open ads: shown in free gaps of resources with the matching workType.
  jobs: [
    { _id: 'j1', workType: 250, numberOfResources: 2, dateStart: '2026-07-06', dateEnd: '2026-08-02' },
    { _id: 'j2', workType: 190, numberOfResources: 1, dateStart: '2026-06-01', dateEnd: '2026-06-21' },
  ],
};
