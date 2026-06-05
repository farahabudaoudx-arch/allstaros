// Where each state's insurance licensing exam is scheduled. Keyed by the
// 2-letter state code stored on recruit.state (set during onboarding). Used by
// the /portal/schedule page to send a recruit straight to the right vendor.
export type ExamSite = {
  vendor: string;
  url: string;
};

export const EXAM_SITES: Record<string, ExamSite> = {
  AL: {
    vendor: "University of Alabama / AL DOI",
    url: "https://aldoi.gov/Licensing/ExamSites.aspx",
  },
  AK: { vendor: "Pearson VUE", url: "https://www.pearsonvue.com/us/en/ak/insurance.html" },
  AZ: { vendor: "PSI", url: "https://test-takers.psiexams.com/anzins" },
  AR: { vendor: "PSI", url: "https://test-takers.psiexams.com/arins" },
  CA: { vendor: "PSI", url: "https://www.psiexams.com/test-takers/cadi/" },
  CO: { vendor: "Pearson VUE", url: "https://www.pearsonvue.com/us/en/co/insurance.html" },
  CT: { vendor: "Pearson VUE", url: "https://www.pearsonvue.com/us/en/ct/insurance.html" },
  DE: { vendor: "Pearson VUE", url: "https://www.pearsonvue.com/us/en/de/insurance.html" },
  FL: { vendor: "Pearson VUE", url: "https://www.pearsonvue.com/us/en/fl/insurance.html" },
  GA: { vendor: "Pearson VUE", url: "https://www.pearsonvue.com/us/en/ga/insurance.html" },
  HI: { vendor: "Pearson VUE", url: "https://www.pearsonvue.com/us/en/hi/insurance.html" },
  ID: { vendor: "Pearson VUE", url: "https://www.pearsonvue.com/us/en/id/insurance.html" },
  IL: { vendor: "Pearson VUE", url: "https://www.pearsonvue.com/us/en/il/insurance.html" },
  IN: { vendor: "Pearson VUE", url: "https://www.pearsonvue.com/us/en/in/insurance.html" },
  IA: { vendor: "Pearson VUE", url: "https://www.pearsonvue.com/us/en/ia/insurance.html" },
  KS: { vendor: "Pearson VUE", url: "https://www.pearsonvue.com/us/en/ks/insurance.html" },
  KY: {
    vendor: "Kentucky DOI",
    url: "https://insurance.ky.gov/ppc/newstatic_info.aspx?MenuID=32&divid=2&static_id=71",
  },
  LA: {
    vendor: "PSI",
    url: "https://ldi.la.gov/docs/default-source/documents/licensing/producers/licensing-handbook.pdf",
  },
  ME: { vendor: "Pearson VUE", url: "https://www.pearsonvue.com/us/en/me/insurance.html" },
  MD: { vendor: "Prometric", url: "https://www.prometric.com/exams/mia/" },
  MA: { vendor: "Prometric", url: "https://www.prometric.com/exams/insurance-ma/" },
  MI: { vendor: "PSI", url: "https://candidate.psiexams.com/DIFS" },
  MN: { vendor: "Pearson VUE", url: "https://home.pearsonvue.com/mncommerce" },
  MS: { vendor: "Pearson VUE", url: "https://www.pearsonvue.com/us/en/ms/insurance.html" },
  MO: { vendor: "Pearson VUE", url: "https://www.pearsonvue.com/us/en/mo/insurance.html" },
  MT: { vendor: "Pearson VUE", url: "https://www.pearsonvue.com/us/en/mt/insurance.html" },
  NE: { vendor: "PSI", url: "https://test-takers.psiexams.com/neins" },
  NV: { vendor: "Pearson VUE", url: "https://www.pearsonvue.com/us/en/nv/insurance.html" },
  NH: { vendor: "PSI", url: "https://www.psiexams.com/test-takers/program-list/" },
  NJ: { vendor: "PSI", url: "https://www.psiexams.com/test-takers/njdobi/" },
  NM: { vendor: "PSI", url: "https://www.psiexams.com/test-takers/program-list/" },
  NY: { vendor: "PSI", url: "https://www.psiexams.com/test-takers/nydfs/" },
  NC: { vendor: "Pearson VUE", url: "https://www.pearsonvue.com/us/en/nc/insurance.html" },
  ND: { vendor: "PSI", url: "https://www.psiexams.com/test-takers/program-list/" },
  OH: { vendor: "PSI", url: "https://www.psiexams.com/test-takers/ohio-ins/" },
  OK: { vendor: "PSI", url: "https://www.psiexams.com/test-takers/program-list/" },
  OR: { vendor: "PSI", url: "https://www.psiexams.com/test-takers/program-list/" },
  PA: { vendor: "PSI", url: "https://www.psiexams.com/test-takers/pa-ins-exam/" },
  RI: { vendor: "Pearson VUE", url: "https://www.pearsonvue.com/us/en/ri/insurance.html" },
  SC: { vendor: "Pearson VUE", url: "https://www.pearsonvue.com/us/en/sc/insurance.html" },
  SD: { vendor: "Pearson VUE", url: "https://www.pearsonvue.com/us/en/sd/insurance.html" },
  TN: { vendor: "Pearson VUE", url: "https://www.pearsonvue.com/us/en/tn/insurance.html" },
  TX: { vendor: "Pearson VUE", url: "https://www.pearsonvue.com/us/en/tx/insurance.html" },
  UT: { vendor: "Prometric", url: "https://www.prometric.com/exams/insurance/" },
  VT: { vendor: "Prometric", url: "https://www.prometric.com/exams/insurance-vt/" },
  VA: { vendor: "Prometric", url: "https://www.prometric.com/exams/insurance-va/" },
  WA: {
    vendor: "PSI",
    url: "https://www.insurance.wa.gov/producers-adjusters/education/first-time-license/how-schedule-insurance-license-exam",
  },
  WV: { vendor: "Pearson VUE", url: "https://www.pearsonvue.com/us/en/wv/insurance.html" },
  WI: { vendor: "PSI", url: "https://www.psiexams.com/test-takers/program-list/" },
  WY: { vendor: "Pearson VUE", url: "https://www.pearsonvue.com/us/en/wy/insurance.html" },
};

export function examSiteForState(code: string | null | undefined): ExamSite | null {
  if (!code) return null;
  return EXAM_SITES[code.toUpperCase()] ?? null;
}
