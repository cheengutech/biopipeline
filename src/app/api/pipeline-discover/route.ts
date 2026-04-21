// src/app/api/pipeline-discover/route.ts
//
// POST { ticker, companyName, sector }
// → {
//     pipeline: [{ drug, target, indication, phase, designations, catalysts, combinations? }],
//     financials: { mktCap, cash, burnRate },
//     confidence: 'high' | 'medium' | 'low',
//     sources: string[],
//     overall_note?: string,
//     last_refreshed: ISO timestamp
//   }
//
// Uses Claude Sonnet 4 with web_search to pull pipeline info from
// 10-Ks, IR pages, and ClinicalTrials.gov — and CONSOLIDATES combination
// trials into the parent drug entry rather than treating them separately.

import { NextResponse } from 'next/server';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 4000;

interface DiscoverReq {
  ticker: string;
  companyName?: string;
  sector?: string;
}

const SYSTEM_PROMPT = `You are a biotech pipeline researcher and asset analyst. Your job is to discover the current clinical pipeline of a publicly-traded biotech company by searching public sources, then CONSOLIDATE the data so each unique drug-indication combination is exactly one pipeline entry.

═══════════════════════════════════════════════════════════════
SOURCES TO USE (in priority order)
═══════════════════════════════════════════════════════════════

1. The company's most recent 10-K, 10-Q, or proxy filing on SEC EDGAR
2. The company's Investor Relations "Pipeline" page on their corporate site
3. ClinicalTrials.gov entries for trials sponsored by the company
4. Recent press releases (last 6 months) about clinical milestones

═══════════════════════════════════════════════════════════════
CRITICAL CONSOLIDATION RULES — read carefully
═══════════════════════════════════════════════════════════════

The most common mistake is treating combination trials as separate drugs. DO NOT make this mistake.

**RULE 1: Each unique (drug × indication) is ONE pipeline entry.**
ANKTIVA in NMIBC is one entry. ANKTIVA in NSCLC is a separate entry. ANKTIVA + BCG in NMIBC is NOT separate — it gets folded into the NMIBC entry.

**RULE 2: Combination trials are not separate programs.**
If you see "DRUG-X + Pembrolizumab", "DRUG-X + Chemo", "DRUG-X + Bevacizumab" all in the same indication, these are different ARMS of trials testing DRUG-X. They are NOT independent pipeline assets. Roll them into one entry for DRUG-X in that indication.

The drug entry should describe the combinations within the indication field or in an optional combinations array.

**RULE 3: Use the "remove the partner" test.**
If "ANKTIVA + Pembrolizumab" still makes sense as a recognizable program when you remove "+ Pembrolizumab" → it's a combination trial of ANKTIVA, not a separate drug. Roll it up.

If "lifileucel + zilurgisertib" only makes sense WITH both molecules being co-developed by the same company → that's a true combination program, list it once with that compound name.

**RULE 4: No literal duplicates.** If you discover the same (drug, indication) twice, deduplicate.

**RULE 5: Group by parent drug.** When you have multiple indications for one drug, list them as separate entries but use IDENTICAL parent drug naming so the user can see they're related.

EXAMPLES of correct consolidation:

ImmunityBio (IBRX) wrong way:
- ANKTIVA (parent)
- ANKTIVA + BCG
- ANKTIVA + Pembrolizumab
- ANKTIVA + Chemo
- ANKTIVA + CAR-NK
- ANKTIVA + Bevacizumab + CAR-NK
- Recombinant BCG

ImmunityBio (IBRX) correct way:
- ANKTIVA — NMIBC (BCG-unresponsive) [Approved] — combinations: monotherapy, +BCG
- ANKTIVA — NSCLC (post-checkpoint) [Phase 2/3] — combinations: +pembrolizumab, +chemo, +CAR-NK
- ANKTIVA — Other solid tumors [Phase 1/2] — combinations: +bevacizumab, +CAR-NK
- Recombinant BCG (rBCG) — NMIBC [Phase 3]

Note how 7+ entries collapsed to 4. The combinations don't disappear — they're documented in context.

═══════════════════════════════════════════════════════════════
PIPELINE DATA TO EXTRACT
═══════════════════════════════════════════════════════════════

For each consolidated drug-indication entry in active clinical development (Phase 1, Phase 2, Phase 3, NDA/BLA, or Approved):

- drug: Internal code or brand name (e.g. "FT819", "ANKTIVA (nogapendekin alfa inbakicept)")
- target: Molecular target (e.g. "CD19", "IL-15 superagonist", "FGFR2"). Use "TIL" for tumor-infiltrating lymphocytes.
- indication: Specific disease + line of therapy. If there are sub-populations or combinations within the indication, mention briefly here (e.g. "NMIBC (BCG-unresponsive, mono and combo with BCG)")
- phase: Use the LATEST phase the drug-indication has reached. ONE of "Phase 1", "Phase 2", "Phase 3", "NDA/BLA", "Approved"
- designations: Array from {"BT", "FT", "AA", "ODD", "PR"}
- combinations: Optional array of combination partners studied (e.g. ["pembrolizumab", "chemo", "CAR-NK"]). Use empty array if monotherapy only.
- catalysts: Array of upcoming catalyst events. PRIORITIZE the highest-impact upcoming catalyst per entry; do not list every readout from every combination arm. Format: { type: "data" | "pdufa" | "conference" | "enrollment" | "nda", label: string, date: string ("Q4 2026" or specific) }

CRITICAL DATA RULES:
- Only include drugs in ACTIVE clinical development. Skip discontinued, paused, or out-licensed programs.
- Use the EXACT phase wording above (no variations like "phase II" or "P2").
- Do NOT invent catalyst dates. If unknown, return catalysts: [].
- Do NOT include preclinical programs unless they have an IND filing scheduled.

═══════════════════════════════════════════════════════════════
FINANCIALS TO EXTRACT (best effort)
═══════════════════════════════════════════════════════════════

- mktCap: Market cap in BILLIONS (e.g. 1.8 for $1.8B). Use the most recent available.
- cash: Cash + investments in BILLIONS, from most recent quarterly filing.
- burnRate: ANNUAL operating cash burn in BILLIONS (e.g. 0.32 for $320M/yr).

If financials cannot be found, omit (do not invent).

═══════════════════════════════════════════════════════════════
CONFIDENCE & SOURCES
═══════════════════════════════════════════════════════════════

- confidence: "high" if pipeline came from current 10-K + IR page; "medium" if some inference from press releases; "low" if very limited public info.
- sources: Array of URLs you actually used (max 5).
- overall_note: Optional caveat if data is incomplete or possibly stale.

═══════════════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════════════

Return ONLY valid JSON, no markdown:

{
  "pipeline": [
    {
      "drug": "ANKTIVA (nogapendekin alfa inbakicept)",
      "target": "IL-15 superagonist",
      "indication": "NMIBC (BCG-unresponsive, mono and combo with BCG)",
      "phase": "Approved",
      "designations": ["BT", "FT"],
      "combinations": ["monotherapy", "BCG"],
      "catalysts": [
        { "type": "data", "label": "5-yr durability follow-up", "date": "Q4 2026" }
      ]
    }
  ],
  "financials": { "mktCap": 8.43, "cash": 0.38, "burnRate": 0.37 },
  "confidence": "high",
  "sources": ["https://..."],
  "overall_note": "Optional caveat"
}

REMEMBER: The single most important rule is consolidation. Combination trials are NOT separate drugs.`;

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

Search the most recent 10-K filing on SEC EDGAR, the company's IR pipeline page, and recent press releases.

CRITICAL: Apply the consolidation rules. Combination trials are NOT separate drugs — roll them up into the parent drug entry for that indication. Each unique (drug × indication) pair is exactly ONE pipeline entry.

Output ONLY the JSON object, no markdown fences, no commentary.`;

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
          {
            type: 'web_search_20250305',
            name: 'web_search',
            max_uses: 8,
          },
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
      if (start === -1 || end === -1) throw new Error('No JSON object found in response');
      parsed = JSON.parse(clean.slice(start, end + 1));
    } catch (e) {
      console.error('Failed to parse Claude response as JSON:', clean);
      return NextResponse.json(
        { error: 'Could not parse AI response as JSON', raw: clean.slice(0, 500) },
        { status: 502 }
      );
    }

    if (!Array.isArray(parsed.pipeline)) {
      return NextResponse.json(
        { error: 'AI response missing or invalid pipeline array', raw: parsed },
        { status: 502 }
      );
    }

    const VALID_PHASES = ['Phase 1', 'Phase 2', 'Phase 3', 'NDA/BLA', 'Approved'];
    const VALID_DESIGS = ['BT', 'FT', 'AA', 'ODD', 'PR'];
    const VALID_CAT_TYPES = ['data', 'pdufa', 'conference', 'enrollment', 'nda'];

    // Sanitize each entry
    let cleaned = parsed.pipeline
      .filter((d: any) => d && typeof d.drug === 'string' && d.drug.trim())
      .map((d: any) => ({
        drug: String(d.drug).trim(),
        target: typeof d.target === 'string' ? d.target.trim() : '',
        indication: typeof d.indication === 'string' ? d.indication.trim() : 'TBD',
        phase: VALID_PHASES.includes(d.phase) ? d.phase : 'Phase 1',
        designations: Array.isArray(d.designations)
          ? d.designations.filter((x: any) => VALID_DESIGS.includes(x))
          : [],
        combinations: Array.isArray(d.combinations)
          ? d.combinations.filter((x: any) => typeof x === 'string').map((x: any) => x.trim())
          : [],
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
      }));

    // ── DEFENSIVE BACKEND DEDUPLICATION ────────────────────────────────────
    // Even if the prompt fails, dedupe (drug, indication) and merge combinations.
    // Use lowercase + trimmed for the key.
    const dedupeMap = new Map<string, any>();
    for (const entry of cleaned) {
      // Strip combination suffixes from drug name for the dedupe key
      // "ANKTIVA + BCG" → "ANKTIVA", "ANKTIVA + Pembrolizumab" → "ANKTIVA"
      const baseDrug = entry.drug.split(/\s*\+\s*/)[0].trim();
      const key = `${baseDrug.toLowerCase()}__${entry.indication.toLowerCase()}`;

      if (!dedupeMap.has(key)) {
        // First time we see this (drug, indication) — record the base drug name
        dedupeMap.set(key, { ...entry, drug: baseDrug });
      } else {
        // Merge: prefer the latest phase, union combinations, union catalysts, union designations
        const existing = dedupeMap.get(key);
        const phaseRank = (p: string) => VALID_PHASES.indexOf(p);
        if (phaseRank(entry.phase) > phaseRank(existing.phase)) existing.phase = entry.phase;

        // Pull combination partner from the dropped entry's drug name if present
        const partnerMatch = entry.drug.match(/\+\s*(.+)$/);
        if (partnerMatch && !existing.combinations.includes(partnerMatch[1].trim())) {
          existing.combinations.push(partnerMatch[1].trim());
        }
        for (const combo of entry.combinations) {
          if (!existing.combinations.includes(combo)) existing.combinations.push(combo);
        }
        for (const des of entry.designations) {
          if (!existing.designations.includes(des)) existing.designations.push(des);
        }
        for (const cat of entry.catalysts) {
          // Only add if not duplicate (same label + date)
          const dup = existing.catalysts.find((c: any) => c.label === cat.label && c.date === cat.date);
          if (!dup) existing.catalysts.push(cat);
        }
      }
    }
    cleaned = Array.from(dedupeMap.values());

    parsed.pipeline = cleaned;

    const fin = parsed.financials ?? {};
    parsed.financials = {
      mktCap: typeof fin.mktCap === 'number' ? fin.mktCap : null,
      cash: typeof fin.cash === 'number' ? fin.cash : null,
      burnRate: typeof fin.burnRate === 'number' ? fin.burnRate : null,
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