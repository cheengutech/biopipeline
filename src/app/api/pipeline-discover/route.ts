// src/app/api/pipeline-discover/route.ts
//
// POST { ticker, companyName, sector }
// → {
//     pipeline: [{ drug, target, indication, phase, designations, catalysts }],
//     financials: { mktCap, cash, burnRate },
//     confidence: 'high' | 'medium' | 'low',
//     sources: string[],
//     overall_note?: string,
//     last_refreshed: ISO timestamp
//   }
//
// Uses Claude Sonnet 4 with web_search tool to pull pipeline info
// from 10-Ks, IR pages, and ClinicalTrials.gov.

import { NextResponse } from 'next/server';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 4000;

interface DiscoverReq {
  ticker: string;
  companyName?: string;
  sector?: string;
}

const SYSTEM_PROMPT = `You are a biotech pipeline researcher. Your job is to discover the current clinical pipeline of a publicly-traded biotech company by searching public sources.

═══════════════════════════════════════════════════════════════
SOURCES TO USE (in priority order)
═══════════════════════════════════════════════════════════════

1. The company's most recent 10-K, 10-Q, or proxy filing on SEC EDGAR
2. The company's Investor Relations "Pipeline" page on their corporate site
3. ClinicalTrials.gov entries for trials sponsored by the company
4. Recent press releases (last 6 months) about clinical milestones

═══════════════════════════════════════════════════════════════
PIPELINE DATA TO EXTRACT
═══════════════════════════════════════════════════════════════

For each drug in active clinical development (Phase 1, Phase 2, Phase 3, NDA/BLA, or Approved):

- drug: Internal code or brand name (e.g. "FT819", "Amtagvi (lifileucel)")
- target: Molecular target (e.g. "CD19", "PD-L1/IL-15", "FGFR2"). Use "TIL" for tumor-infiltrating lymphocytes, "Multiple" if undisclosed.
- indication: Specific disease + line of therapy (e.g. "Cervical Cancer (TIL)", "Melanoma (post-PD1)")
- phase: ONE of "Phase 1", "Phase 2", "Phase 3", "NDA/BLA", "Approved"
- designations: Array of FDA designations from {"BT", "FT", "AA", "ODD", "PR"}. BT=Breakthrough, FT=Fast Track, AA=Accelerated Approval, ODD=Orphan, PR=Priority Review
- catalysts: Array of upcoming catalyst events, each with: { type: "data" | "pdufa" | "conference" | "enrollment" | "nda", label: string (e.g. "Ph2 ORR Data"), date: string ("Q4 2026" or "H1 2027" or specific) }

CRITICAL RULES:
- Only include drugs in ACTIVE clinical development. Skip discontinued, paused, or out-licensed programs.
- Use the EXACT phase wording above (no variations like "phase II" or "P2").
- If a drug has multiple indications, list it as separate pipeline entries (one per indication).
- If you cannot find specific catalyst dates, use approximate quarters from press release/IR commentary. If no commentary, return catalysts: [].
- Do NOT invent catalyst dates. If unknown, omit.
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
- overall_note: Optional caveat if the data is incomplete or possibly stale.

═══════════════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════════════

Return ONLY valid JSON, no markdown:

{
  "pipeline": [
    {
      "drug": "...",
      "target": "...",
      "indication": "...",
      "phase": "Phase 2",
      "designations": ["FT", "ODD"],
      "catalysts": [
        { "type": "data", "label": "Ph2 ORR Data", "date": "Q4 2026" }
      ]
    }
  ],
  "financials": {
    "mktCap": 1.8,
    "cash": 0.65,
    "burnRate": 0.32
  },
  "confidence": "high",
  "sources": ["https://...", "https://..."],
  "overall_note": "Optional caveat string"
}`;

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

Search the most recent 10-K filing on SEC EDGAR, the company's IR pipeline page, and recent press releases. Return the full active clinical pipeline as JSON per the format specified.

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

    // Extract final text from content blocks (skip tool_use / web_search_result blocks)
    const text = (data?.content ?? [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n');

    // Strip markdown fences if present
    const clean = text.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '').trim();

    let parsed;
    try {
      // Find first { and last } to extract JSON if there's surrounding text
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

    // Validate basic shape
    if (!Array.isArray(parsed.pipeline)) {
      return NextResponse.json(
        { error: 'AI response missing or invalid pipeline array', raw: parsed },
        { status: 502 }
      );
    }

    // Sanitize each pipeline entry
    const VALID_PHASES = ['Phase 1', 'Phase 2', 'Phase 3', 'NDA/BLA', 'Approved'];
    const VALID_DESIGS = ['BT', 'FT', 'AA', 'ODD', 'PR'];
    const VALID_CAT_TYPES = ['data', 'pdufa', 'conference', 'enrollment', 'nda'];

    parsed.pipeline = parsed.pipeline
      .filter((d: any) => d && typeof d.drug === 'string' && d.drug.trim())
      .map((d: any) => ({
        drug: String(d.drug).trim(),
        target: typeof d.target === 'string' ? d.target.trim() : '',
        indication: typeof d.indication === 'string' ? d.indication.trim() : 'TBD',
        phase: VALID_PHASES.includes(d.phase) ? d.phase : 'Phase 1',
        designations: Array.isArray(d.designations)
          ? d.designations.filter((x: any) => VALID_DESIGS.includes(x))
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
        // Add the science scaffold (defaulted to 3) so downstream calc doesn't blow up
        science: { targetVal: 3, moa: 3, endpoint: 3, trial: 3, biomarker: 3, safety: 3 },
        enrollment: 0,
        primaryEndpoint: 'TBD',
        data: 'TBD',
        orphan: Array.isArray(d.designations) && d.designations.includes('ODD'),
        peakSales: 1.0,
      }));

    // Default financials shape
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