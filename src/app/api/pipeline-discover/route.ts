// src/app/api/pipeline-discover/route.ts
//
// POST { ticker, companyName, sector }
// → {
//     pipeline: [{ drug, target, indication, phase, designations, combinations, catalysts }],
//     financials: { cash, burnRate },     ← mktCap intentionally omitted; use Finnhub
//     confidence: 'high' | 'medium' | 'low',
//     sources: string[],
//     overall_note?: string,
//     last_refreshed: ISO timestamp
//   }
//
// Drug names with combination partners are AGGRESSIVELY cleaned:
//   "ANKTIVA + BCG"          → drug: "ANKTIVA",     combinations: ["BCG"]
//   "ANKTIVA + Pembro + Chemo" → drug: "ANKTIVA",   combinations: ["Pembro", "Chemo"]
// Then dedup by (base_drug × indication) merges everything cleanly.

import { NextResponse } from 'next/server';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 4000;

interface DiscoverReq {
  ticker: string;
  companyName?: string;
  sector?: string;
}

const SYSTEM_PROMPT = `You are a biotech pipeline researcher. Your job is to discover a publicly-traded biotech's current clinical pipeline by searching public sources, then CONSOLIDATE the data so each unique drug-indication pair is exactly one entry.

═══════════════════════════════════════════════════════════════
SOURCES TO USE (priority order)
═══════════════════════════════════════════════════════════════
1. Most recent 10-K, 10-Q, or proxy filing on SEC EDGAR
2. Investor Relations "Pipeline" page on the company's site
3. ClinicalTrials.gov entries (sponsor = the company)
4. Recent press releases (last 6 months)

═══════════════════════════════════════════════════════════════
CRITICAL CONSOLIDATION RULES
═══════════════════════════════════════════════════════════════

**RULE 1: Each unique (drug × indication) is ONE entry.**

**RULE 2: The drug field contains the BASE drug name only — never combinations.**
- WRONG: "ANKTIVA + BCG"
- WRONG: "ANKTIVA + Pembrolizumab"
- RIGHT: drug = "ANKTIVA", combinations = ["BCG"]
- RIGHT: drug = "ANKTIVA", combinations = ["Pembrolizumab"]

If you see combination trials, list the partner drugs in the combinations array. NEVER put "+" in the drug field.

**RULE 3: Use the "remove the partner" test.**
"ANKTIVA + Pembrolizumab" — remove "+ Pembrolizumab" → "ANKTIVA" still makes sense. So the drug is ANKTIVA, combination is Pembrolizumab.

**RULE 4: One drug × one indication × all combinations = ONE entry.**
ImmunityBio's NSCLC trials of ANKTIVA + Tislelizumab, ANKTIVA + Pembrolizumab, ANKTIVA + Chemo are all the SAME pipeline entry (ANKTIVA in NSCLC), with combinations: ["Tislelizumab", "Pembrolizumab", "Chemo"].

**RULE 5: No literal duplicates.**

EXAMPLES:

WRONG (what NOT to do):
[
  { "drug": "ANKTIVA", "indication": "NMIBC" },
  { "drug": "ANKTIVA + BCG", "indication": "NMIBC" },
  { "drug": "ANKTIVA + Pembro", "indication": "NSCLC" },
  { "drug": "ANKTIVA + Chemo", "indication": "NSCLC" }
]

RIGHT:
[
  { "drug": "ANKTIVA", "indication": "NMIBC (BCG-unresponsive CIS)", "combinations": ["BCG"] },
  { "drug": "ANKTIVA", "indication": "NSCLC (post-checkpoint)", "combinations": ["Pembrolizumab", "Chemo"] }
]

═══════════════════════════════════════════════════════════════
PIPELINE FIELDS
═══════════════════════════════════════════════════════════════

For each consolidated drug-indication entry in active clinical development:

- drug: BASE drug name only, NO "+" allowed (e.g. "ANKTIVA (nogapendekin alfa inbakicept)", "FT819", "lifileucel")
- target: Molecular target (e.g. "CD19", "IL-15 superagonist", "FGFR2"). Use "TIL" for tumor-infiltrating lymphocytes.
- indication: Specific disease + line of therapy (e.g. "NMIBC (BCG-unresponsive CIS)", "Melanoma (post-PD1)")
- phase: ONE of "Phase 1" | "Phase 2" | "Phase 3" | "NDA/BLA" | "Approved"
- designations: Array from {"BT", "FT", "AA", "ODD", "PR"}
- combinations: Array of partner drug names studied with this drug in this indication. Empty array if monotherapy only.
- catalysts: Highest-impact upcoming events. Format: { type: "data" | "pdufa" | "conference" | "enrollment" | "nda", label: string, date: string ("Q4 2026" or specific) }

CRITICAL DATA RULES:
- ACTIVE clinical only. Skip discontinued/paused/out-licensed.
- Use EXACT phase wording.
- Do NOT invent catalyst dates. If unknown → catalysts: [].
- Skip preclinical unless IND filing scheduled.

═══════════════════════════════════════════════════════════════
FINANCIALS (best effort — note we use Finnhub for mktCap separately)
═══════════════════════════════════════════════════════════════

- cash: Cash + investments in BILLIONS (most recent 10-Q)
- burnRate: ANNUAL operating cash burn in BILLIONS

DO NOT include mktCap — we get that live from Finnhub.

═══════════════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════════════

Return ONLY valid JSON, no markdown:

{
  "pipeline": [
    {
      "drug": "ANKTIVA (nogapendekin alfa inbakicept)",
      "target": "IL-15 superagonist",
      "indication": "NMIBC (BCG-unresponsive CIS)",
      "phase": "Approved",
      "designations": ["BT", "FT"],
      "combinations": ["BCG"],
      "catalysts": [
        { "type": "data", "label": "5-year durability follow-up", "date": "Q4 2026" }
      ]
    }
  ],
  "financials": { "cash": 0.38, "burnRate": 0.39 },
  "confidence": "high",
  "sources": ["https://..."],
  "overall_note": "Optional caveat"
}

REMEMBER: drug field NEVER contains "+". Partners go in combinations[]. One (drug × indication) = one entry.`;

export async function POST(req: Request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set in environment' }, { status: 500 });
    }

    const body = (await req.json()) as DiscoverReq;
    const { ticker, companyName, sector } = body;

    if (!ticker) {
      return NextResponse.json({ error: 'Missing required field: ticker' }, { status: 400 });
    }

    const userMessage = `Discover the current clinical pipeline for this publicly-traded biotech:

Ticker: ${ticker}
${companyName ? `Company name: ${companyName}` : ''}
${sector ? `Sector: ${sector}` : ''}

Search the most recent 10-K filing on SEC EDGAR, the IR pipeline page, and recent press releases.

CRITICAL: Apply the consolidation rules. The drug field contains BASE NAME ONLY — never "+". Combination partners go in the combinations array. One (drug × indication) pair = exactly one entry.

DO NOT include mktCap in financials — we get that from Finnhub.

Output ONLY the JSON object, no markdown, no commentary.`;

    const anthropicRes = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
        tools: [
          { type: 'web_search_20250305', name: 'web_search', max_uses: 8 },
        ],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error('Anthropic API error:', anthropicRes.status, errText);
      return NextResponse.json(
        { error: `Anthropic API error: ${anthropicRes.status}`, detail: errText },
        { status: 502 }
      );
    }

    const data = await anthropicRes.json();
    const text = (data?.content ?? [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n');
    const clean = text.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '').trim();

    let parsed;
    try {
      const start = clean.indexOf('{');
      const end = clean.lastIndexOf('}');
      if (start === -1 || end === -1) throw new Error('No JSON object found');
      parsed = JSON.parse(clean.slice(start, end + 1));
    } catch (e) {
      console.error('Failed to parse Claude response as JSON:', clean);
      return NextResponse.json({ error: 'Could not parse AI response as JSON', raw: clean.slice(0, 500) }, { status: 502 });
    }

    if (!Array.isArray(parsed.pipeline)) {
      return NextResponse.json({ error: 'Missing pipeline array', raw: parsed }, { status: 502 });
    }

    const VALID_PHASES = ['Phase 1', 'Phase 2', 'Phase 3', 'NDA/BLA', 'Approved'];
    const VALID_DESIGS = ['BT', 'FT', 'AA', 'ODD', 'PR'];
    const VALID_CAT_TYPES = ['data', 'pdufa', 'conference', 'enrollment', 'nda'];

    // ── Step 1: AGGRESSIVELY split combination partners out of drug name ─────
    // Even if Claude ignores Rule 2, we strip everything from "+" onwards.
    const splitDrugAndCombinations = (rawName: string): { baseDrug: string; partners: string[] } => {
      // Split on " + " or "+" (with possible spaces)
      const parts = rawName.split(/\s*\+\s*/);
      const baseDrug = parts[0].trim();
      const partners = parts.slice(1).map(p => p.trim()).filter(Boolean);
      return { baseDrug, partners };
    };

    let cleaned = parsed.pipeline
      .filter((d: any) => d && typeof d.drug === 'string' && d.drug.trim())
      .map((d: any) => {
        const { baseDrug, partners } = splitDrugAndCombinations(d.drug);
        const promptCombos = Array.isArray(d.combinations)
          ? d.combinations.filter((x: any) => typeof x === 'string').map((x: any) => x.trim())
          : [];
        // Union of partners stripped from name + partners listed in combinations field
        const allCombos = Array.from(new Set([...partners, ...promptCombos]));
        return {
          drug: baseDrug,
          target: typeof d.target === 'string' ? d.target.trim() : '',
          indication: typeof d.indication === 'string' ? d.indication.trim() : 'TBD',
          phase: VALID_PHASES.includes(d.phase) ? d.phase : 'Phase 1',
          designations: Array.isArray(d.designations)
            ? d.designations.filter((x: any) => VALID_DESIGS.includes(x))
            : [],
          combinations: allCombos,
          catalysts: Array.isArray(d.catalysts)
            ? d.catalysts
                .filter((c: any) => c && typeof c.label === 'string' && VALID_CAT_TYPES.includes(c.type))
                .map((c: any) => ({
                  type: c.type,
                  label: String(c.label).trim(),
                  date: typeof c.date === 'string' ? c.date.trim() : 'TBD',
                }))
            : [],
          science: { targetVal: 3, moa: 3, endpoint: 3, trial: 3, biomarker: 3, safety: 3 },
          enrollment: 0,
          primaryEndpoint: 'TBD',
          data: 'TBD',
          orphan: Array.isArray(d.designations) && d.designations.includes('ODD'),
          peakSales: 1.0,
        };
      });

    // ── Step 2: Dedup by (baseDrug × indication), merging fields ────────────
    const dedupeMap = new Map<string, any>();
    for (const entry of cleaned) {
      const key = `${entry.drug.toLowerCase()}__${entry.indication.toLowerCase()}`;
      if (!dedupeMap.has(key)) {
        dedupeMap.set(key, entry);
      } else {
        const existing = dedupeMap.get(key);
        const phaseRank = (p: string) => VALID_PHASES.indexOf(p);
        if (phaseRank(entry.phase) > phaseRank(existing.phase)) existing.phase = entry.phase;
        for (const combo of entry.combinations) {
          if (!existing.combinations.includes(combo)) existing.combinations.push(combo);
        }
        for (const des of entry.designations) {
          if (!existing.designations.includes(des)) existing.designations.push(des);
        }
        for (const cat of entry.catalysts) {
          const dup = existing.catalysts.find((c: any) => c.label === cat.label && c.date === cat.date);
          if (!dup) existing.catalysts.push(cat);
        }
        // If the existing entry has empty target but new entry does, fill it
        if (!existing.target && entry.target) existing.target = entry.target;
      }
    }
    parsed.pipeline = Array.from(dedupeMap.values());

    // ── Step 3: Financials — only cash and burnRate, NEVER mktCap ───────────
    const fin = parsed.financials ?? {};
    parsed.financials = {
      cash: typeof fin.cash === 'number' ? fin.cash : null,
      burnRate: typeof fin.burnRate === 'number' ? fin.burnRate : null,
      // mktCap intentionally omitted — Finnhub is canonical
    };

    parsed.confidence = ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'low';
    parsed.sources = Array.isArray(parsed.sources) ? parsed.sources.slice(0, 5) : [];
    parsed.last_refreshed = new Date().toISOString();

    return NextResponse.json(parsed);
  } catch (e: any) {
    console.error('pipeline-discover route error:', e);
    return NextResponse.json({ error: e.message ?? 'Unknown error' }, { status: 500 });
  }
}