// ── FDA PHASE TRANSITION PROBABILITIES (MIT/BIO study 2010-2024) ──────────────
export const FDA_PROBS: Record<string, { toApproval: number; nextProb: number }> = {
  'Phase 1': { toApproval: 0.096, nextProb: 0.527 },
  'Phase 2': { toApproval: 0.162, nextProb: 0.285 },
  'Phase 3': { toApproval: 0.578, nextProb: 0.578 },
  'NDA/BLA': { toApproval: 0.875, nextProb: 0.875 },
  'Approved': { toApproval: 1.0,  nextProb: 1.0   },
};

export const SECTOR_MOD: Record<string, number> = {
  oncology: 1.15,
  immunology: 1.05,
  neurology: 0.85,
  rare: 1.25,
  cardio: 0.95,
};

export const DESIG_MOD: Record<string, number> = {
  BT:  2.0,
  FT:  1.3,
  AA:  1.5,
  ODD: 1.25,
  PR:  0.7,
};

// ── CATALYST IMPACT (historical avg % move on event type) ─────────────────────
export const CATALYST_IMPACT: Record<string, { posBase: number; negBase: number }> = {
  'PDUFA':      { posBase: 18, negBase: 42 },
  'Phase 3':    { posBase: 35, negBase: 55 },
  'Phase 2':    { posBase: 22, negBase: 38 },
  'Phase 1':    { posBase: 10, negBase: 18 },
  'NDA/BLA':    { posBase: 12, negBase: 20 },
  'Conference': { posBase: 8,  negBase: 12 },
  'Enrollment': { posBase: 6,  negBase: 10 },
};

// ── SCIENCE DIMENSIONS ────────────────────────────────────────────────────────
export const SCIENCE_DIMS = [
  {
    id: 'targetVal', label: 'Target Validation', weight: 0.20,
    desc: 'How well validated is the biological target? Genetic evidence (GWAS, Mendelian randomization) is the gold standard.',
    levels: ['No preclinical data','Animal model only','Biomarker correlation','Genetic evidence (one study)','Strong genetic + clinical PoC'],
  },
  {
    id: 'moa', label: 'Mechanism of Action', weight: 0.15,
    desc: 'First-in-class carries higher scientific risk but higher upside. Me-too on a validated pathway is safer.',
    levels: ['First-in-class, unproven target','FIC with some PoC','Fast-follower, differentiated','Validated class, improved profile','Established mechanism, clear differentiation'],
  },
  {
    id: 'endpoint', label: 'Endpoint Quality', weight: 0.20,
    desc: 'Hard clinical endpoints (OS, hospitalization) vs. surrogate biomarkers. FDA increasingly scrutinizes surrogates.',
    levels: ['Novel surrogate, no precedent','Surrogate, weak correlation','Accepted surrogate','Surrogate + hard endpoint','Hard clinical endpoint (OS/hospitalization)'],
  },
  {
    id: 'trial', label: 'Trial Design Rigor', weight: 0.20,
    desc: 'Properly powered? Randomized controlled? Appropriate comparator arm?',
    levels: ['Single arm, no control','Single arm, historical control','Randomized vs placebo','RCT vs SoC, modest power','RCT vs SoC, well-powered, pre-specified'],
  },
  {
    id: 'biomarker', label: 'Patient Selection', weight: 0.15,
    desc: 'Biomarker-selected populations have higher PoS but smaller market. Unselected populations are harder to win.',
    levels: ['Unselected, heterogeneous','Loose clinical criteria','Clinical enrichment','Validated biomarker (companion dx)','Genetically defined population'],
  },
  {
    id: 'safety', label: 'Safety Profile', weight: 0.10,
    desc: 'Clean Ph1 safety data de-risks the program. DLTs or AEs signal future problems.',
    levels: ['Multiple serious AEs in Ph1','DLTs observed, narrow window','Manageable AEs, discontinuations','Minor AEs, good tolerability','Clean safety, broad therapeutic index'],
  },
];

// ── CRL PATTERNS BY SECTOR ────────────────────────────────────────────────────
export const CRL_PATTERNS: Record<string, { reason: string; freq: string; desc: string }[]> = {
  oncology: [
    { reason: 'Insufficient OS benefit', freq: '38%', desc: 'Surrogate endpoints not sufficient without OS data, especially later-line.' },
    { reason: 'CMC / manufacturing deficiencies', freq: '22%', desc: 'Chemistry, Manufacturing & Controls issues. Common for biologics and novel modalities.' },
    { reason: 'REMS required / label disagreement', freq: '18%', desc: 'Black box warnings or REMS required. FDA may disagree on patient population labeling.' },
    { reason: 'Inadequate safety follow-up', freq: '14%', desc: 'Long-term safety data insufficient. Problematic for immunotherapy combinations.' },
  ],
  neurology: [
    { reason: 'Endpoint not clinically meaningful', freq: '41%', desc: "Cognitive or functional scales not sensitive enough. FDA's most common CNS rejection." },
    { reason: 'Patient population heterogeneity', freq: '28%', desc: 'Broad inclusion criteria dilute treatment effect. Biomarker enrichment increasingly expected.' },
    { reason: 'Clinical meaningfulness threshold', freq: '19%', desc: 'Statistically significant but FDA questions patient-meaningful change.' },
    { reason: 'Trial duration insufficient', freq: '12%', desc: 'Disease modification claims require longer follow-up. Common in Alzheimer\'s.' },
  ],
  rare: [
    { reason: 'Natural history data inadequate', freq: '35%', desc: 'Historical control comparison requires robust natural history data. Often underdeveloped.' },
    { reason: 'Biomarker not validated', freq: '29%', desc: 'Surrogate endpoints in rare disease often lack validation.' },
    { reason: 'Manufacturing / lot consistency', freq: '21%', desc: 'Gene/cell therapy manufacturing scale-up triggers CRL due to lot-to-lot variability.' },
    { reason: 'Patient numbers insufficient', freq: '15%', desc: 'Even with Accelerated Approval, FDA may require larger confirmatory data.' },
  ],
  immunology: [
    { reason: 'Comparator arm inadequacy', freq: '33%', desc: 'Standard of care evolving rapidly in many autoimmune indications.' },
    { reason: 'Long-term safety — infections', freq: '27%', desc: 'Immunosuppression raises infection risk concerns. FDA requires sufficient follow-up.' },
    { reason: 'Benefit-risk in moderate disease', freq: '24%', desc: 'Stricter benefit-risk in moderate indications given available alternatives.' },
    { reason: 'Inadequate special populations data', freq: '16%', desc: 'Pediatric, renal/hepatic impairment data often cited in CRLs for biologics.' },
  ],
  cardio: [
    { reason: 'MACE endpoint not powered', freq: '44%', desc: 'FDA requires CVOT for most cardio drugs. Insufficient MACE data is top rejection reason.' },
    { reason: 'Mortality benefit not shown', freq: '31%', desc: 'For serious CV indications, FDA expects mortality benefit, not just biomarker improvement.' },
    { reason: 'Safety concern (proarrhythmia)', freq: '14%', desc: 'Cardiac safety signals can trigger CRL even with positive efficacy.' },
    { reason: 'Drug interaction data missing', freq: '11%', desc: 'Cardio patients on complex regimens. DDI data gaps commonly cited.' },
  ],
};

// ── FDA HISTORICAL COMPS ──────────────────────────────────────────────────────
export const FDA_COMPS: Record<string, any[]> = {
  oncology: [
    { drug: 'Keytruda', company: 'Merck', indication: 'NSCLC (PD-L1 ≥50%)', mechanism: 'PD-1 inhibitor', endpoint: 'OS', year: 2016, outcome: 'approved', note: 'Set precedent for biomarker-selected IO approval. Benchmark for all solid tumor programs.' },
    { drug: 'Sotorasib', company: 'Amgen', indication: 'KRAS G12C NSCLC', mechanism: 'KRAS inhibitor', endpoint: 'ORR', year: 2021, outcome: 'approved', note: 'First-in-class KRAS. Accelerated approval on ORR 37.1%. Confirmatory trial required.' },
    { drug: 'Futibatinib', company: 'Taiho', indication: 'FGFR2 Cholangiocarcinoma', mechanism: 'FGFR2 inhibitor', endpoint: 'ORR', year: 2022, outcome: 'approved', note: '42% ORR, DoR 9.7mo. Direct comp for FGFR2 programs like RLY-4008.' },
    { drug: 'Amtagvi (lifileucel)', company: 'Iovance', indication: 'Melanoma (post-PD1)', mechanism: 'TIL therapy', endpoint: 'ORR', year: 2024, outcome: 'approved', note: 'First TIL therapy approval. ORR 31.5% in heavily pre-treated melanoma. Relevant for IOVA pipeline.' },
  ],
  neurology: [
    { drug: 'Lecanemab', company: 'Eisai/Biogen', indication: 'Early Alzheimer\'s', mechanism: 'Anti-amyloid mAb', endpoint: 'CDR-SB', year: 2023, outcome: 'approved', note: 'CDR-SB −0.45 vs placebo. Set clinical meaningfulness threshold for AD.' },
    { drug: 'Donanemab', company: 'Lilly', indication: 'Early Alzheimer\'s', mechanism: 'Anti-amyloid mAb', endpoint: 'iADRS', year: 2024, outcome: 'approved', note: '35% slowing in low/medium tau. ARIA rates significant.' },
    { drug: 'Zuranolone', company: 'Sage/Biogen', indication: 'MDD / PPD', mechanism: 'GABA-A modulator', endpoint: 'HAMD-17', year: 2023, outcome: 'approved', note: 'MDD approval narrower than expected — cautionary tale on endpoint selection.' },
  ],
  rare: [
    { drug: 'Casgevy', company: 'Vertex/CRISPR', indication: 'Sickle Cell / Beta-thal', mechanism: 'CRISPR-Cas9', endpoint: 'Transfusion freedom', year: 2023, outcome: 'approved', note: 'First CRISPR therapy. Landmark for gene editing modality validation.' },
    { drug: 'Givosiran', company: 'Alnylam', indication: 'Acute Porphyria', mechanism: 'siRNA', endpoint: 'Annualized attack rate', year: 2019, outcome: 'approved', note: 'First liver-targeted siRNA for rare disease. Validates ARO/NTLA platform approach.' },
    { drug: 'Fitusiran', company: 'Sanofi', indication: 'Hemophilia A/B', mechanism: 'siRNA (antithrombin)', endpoint: 'ABR', year: 2024, outcome: 'approved', note: 'Monthly subcutaneous siRNA. Validates RNAi in hemophilia.' },
  ],
  immunology: [
    { drug: 'Bimekizumab', company: 'UCB', indication: 'Plaque Psoriasis', mechanism: 'IL-17A/F inhibitor', endpoint: 'PASI 90', year: 2023, outcome: 'approved', note: 'Dual IL-17 inhibition. Differentiation through mechanism in crowded class.' },
    { drug: 'Deucravacitinib', company: 'BMS', indication: 'Plaque Psoriasis', mechanism: 'TYK2 inhibitor', endpoint: 'PASI 75', year: 2022, outcome: 'approved', note: 'Novel TYK2 selective mechanism. Established TYK2 as validated target.' },
  ],
  cardio: [
    { drug: 'Finerenone', company: 'Bayer', indication: 'CKD + T2D', mechanism: 'Non-steroidal MRA', endpoint: 'MACE + renal', year: 2021, outcome: 'approved', note: 'Required 13,000 patient CVOT. Exemplifies the cardio trial bar.' },
    { drug: 'Inclisiran', company: 'Novartis', indication: 'Hypercholesterolemia', mechanism: 'siRNA (PCSK9)', endpoint: 'LDL-C', year: 2021, outcome: 'approved', note: 'Twice-yearly siRNA. No CVOT required given established LDL-CV link.' },
  ],
};

// ── PIPELINE DATA ─────────────────────────────────────────────────────────────
export const DEFAULT_COMPANIES = [
  {
    name: 'Iovance Biotherapeutics', ticker: 'IOVA', sector: 'oncology',
    mktCap: 1.8, price: 3.50, priceChange: 0, cash: 0.65, burnRate: 0.32,
    pipeline: [
      {
        drug: 'Amtagvi (lifileucel)', indication: 'Melanoma (post-PD1)', phase: 'Approved',
        enrollment: 153, primaryEndpoint: 'ORR', data: 'Launched', orphan: false,
        designations: ['BT'], peakSales: 1.2,
        science: { targetVal: 4, moa: 4, endpoint: 4, trial: 4, biomarker: 3, safety: 4 },
        catalysts: [],
      },
      {
        drug: 'LN-145 (cervical)', indication: 'Cervical Cancer (TIL)', phase: 'NDA/BLA',
        enrollment: 102, primaryEndpoint: 'ORR', data: 'Q2 2026', orphan: false,
        designations: ['BT', 'FT'], peakSales: 0.8,
        science: { targetVal: 4, moa: 4, endpoint: 3, trial: 3, biomarker: 3, safety: 4 },
        catalysts: [{ type: 'pdufa', label: 'PDUFA Date', date: 'Q2 2026' }],
      },
      {
        drug: 'LN-145 (NSCLC)', indication: 'Non-Small Cell Lung', phase: 'Phase 2',
        enrollment: 87, primaryEndpoint: 'ORR', data: 'Q4 2026', orphan: false,
        designations: ['FT'], peakSales: 1.8,
        science: { targetVal: 3, moa: 4, endpoint: 3, trial: 3, biomarker: 3, safety: 4 },
        catalysts: [{ type: 'data', label: 'Ph2 Data', date: 'Q4 2026' }],
      },
    ],
  },
  {
    name: 'Moderna', ticker: 'MRNA', sector: 'immunology',
    mktCap: 18.4, price: 48.20, priceChange: 0, cash: 9.2, burnRate: 1.1,
    pipeline: [
      {
        drug: 'mRNA-4157', indication: 'Melanoma (adjuvant)', phase: 'Phase 3',
        enrollment: 1089, primaryEndpoint: 'RFS', data: 'Q3 2026', orphan: false,
        designations: ['BT', 'FT'], peakSales: 3.5,
        science: { targetVal: 4, moa: 3, endpoint: 4, trial: 5, biomarker: 4, safety: 4 },
        catalysts: [{ type: 'data', label: 'Ph3 Interim', date: 'Q3 2026' }, { type: 'conference', label: 'ASCO 2026', date: 'Q2 2026' }],
      },
      {
        drug: 'mRNA-1010', indication: 'Seasonal Influenza', phase: 'Phase 3',
        enrollment: 8900, primaryEndpoint: 'Seroconversion', data: 'Q4 2026', orphan: false,
        designations: [], peakSales: 1.8,
        science: { targetVal: 5, moa: 4, endpoint: 4, trial: 5, biomarker: 3, safety: 5 },
        catalysts: [{ type: 'data', label: 'Ph3 Results', date: 'Q4 2026' }],
      },
    ],
  },
  {
    name: 'Intellia Therapeutics', ticker: 'NTLA', sector: 'rare',
    mktCap: 1.9, price: 14.22, priceChange: 0, cash: 0.95, burnRate: 0.28,
    pipeline: [
      {
        drug: 'NTLA-2001', indication: 'Transthyretin Amyloidosis', phase: 'Phase 3',
        enrollment: 765, primaryEndpoint: 'Polyneuropathy', data: 'Q1 2027', orphan: true,
        designations: ['BT', 'FT', 'ODD'], peakSales: 2.8,
        science: { targetVal: 5, moa: 4, endpoint: 5, trial: 5, biomarker: 5, safety: 3 },
        catalysts: [
          { type: 'enrollment', label: 'Full Enrollment', date: 'Q3 2026' },
          { type: 'data', label: 'Ph3 Top-line', date: 'Q1 2027' },
          { type: 'nda', label: 'NDA Filing', date: 'Q3 2027' },
        ],
      },
      {
        drug: 'NTLA-2002', indication: 'Hereditary Angioedema', phase: 'Phase 3',
        enrollment: 110, primaryEndpoint: 'HAE attacks', data: 'Q4 2026', orphan: true,
        designations: ['ODD', 'BT'], peakSales: 1.1,
        science: { targetVal: 5, moa: 4, endpoint: 5, trial: 4, biomarker: 4, safety: 3 },
        catalysts: [{ type: 'data', label: 'Ph3 Data', date: 'Q4 2026' }],
      },
    ],
  },
  {
    name: 'Arrowhead Pharma', ticker: 'ARWR', sector: 'rare',
    mktCap: 3.2, price: 20.11, priceChange: 0, cash: 0.8, burnRate: 0.25,
    pipeline: [
      {
        drug: 'Plozasiran', indication: 'Hypertriglyceridemia', phase: 'NDA/BLA',
        enrollment: 1142, primaryEndpoint: 'TG reduction', data: 'Q3 2026', orphan: false,
        designations: ['FT'], peakSales: 1.4,
        science: { targetVal: 5, moa: 5, endpoint: 4, trial: 5, biomarker: 3, safety: 5 },
        catalysts: [{ type: 'pdufa', label: 'PDUFA Date', date: 'Q3 2026' }],
      },
      {
        drug: 'ARO-APOC3', indication: 'Familial Chylomicronemia', phase: 'Phase 3',
        enrollment: 880, primaryEndpoint: 'TG reduction', data: 'Q4 2026', orphan: true,
        designations: ['ODD', 'BT'], peakSales: 0.9,
        science: { targetVal: 5, moa: 5, endpoint: 4, trial: 4, biomarker: 4, safety: 5 },
        catalysts: [{ type: 'data', label: 'Ph3 Top-line', date: 'Q4 2026' }],
      },
    ],
  },
  {
    name: 'Relay Therapeutics', ticker: 'RLAY', sector: 'oncology',
    mktCap: 0.68, price: 6.10, priceChange: 0, cash: 0.31, burnRate: 0.15,
    pipeline: [
      {
        drug: 'RLY-4008', indication: 'FGFR2 Cholangiocarcinoma', phase: 'Phase 2',
        enrollment: 156, primaryEndpoint: 'ORR', data: 'Q4 2026', orphan: true,
        designations: ['BT', 'FT', 'ODD'], peakSales: 0.7,
        science: { targetVal: 5, moa: 4, endpoint: 3, trial: 3, biomarker: 5, safety: 4 },
        catalysts: [
          { type: 'data', label: 'Ph2 ORR Data', date: 'Q4 2026' },
          { type: 'conference', label: 'ASCO 2026', date: 'Q2 2026' },
        ],
      },
    ],
  },
];

// ── SCORING HELPERS ───────────────────────────────────────────────────────────
export function calcScienceMultiplier(scores: Record<string, number>): number {
  let weighted = 0;
  SCIENCE_DIMS.forEach(d => { weighted += (scores[d.id] || 3) * d.weight; });
  return 0.55 + ((weighted - 1) / 4) * 0.90;
}

export function calcApprovalProb(
  drug: any,
  sector: string,
  scienceScores?: Record<string, number>
): number {
  const base = FDA_PROBS[drug.phase]?.toApproval ?? 1.0;
  const sm = SECTOR_MOD[sector] ?? 1.0;
  let dm = 1.0;
  (drug.designations ?? []).forEach((d: string) => { dm *= DESIG_MOD[d] ?? 1.0; });
  const sciMult = scienceScores ? calcScienceMultiplier(scienceScores) : calcScienceMultiplier(drug.science ?? {});
  return Math.min(base * sm * dm * sciMult, 0.97);
}

export function calcCompanyScore(company: any, scienceScoresMap: Record<string, Record<string, number>>): number {
  let s = 0;
  company.pipeline.forEach((d: any) => {
    const key = company.ticker + '_' + d.drug;
    s += calcApprovalProb(d, company.sector, scienceScoresMap[key] ?? d.science);
  });
  const avg = s / company.pipeline.length;
  const runway = Math.min((company.cash / company.burnRate) / 10, 1.0);
  return Math.round((avg * 0.7 + runway * 0.3) * 100);
}
