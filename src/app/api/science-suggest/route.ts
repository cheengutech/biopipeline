// src/app/api/science-suggest/route.ts
//
// POST { ticker, drug, indication, phase, sector, designations? }
// → { scores: { targetVal, moa, endpoint, trial, biomarker, safety },
//     reasoning: { targetVal: "...", moa: "...", ... },
//     confidence: { targetVal: "high"|"medium"|"low", ... },
//     overall_note?: string }
//
// Uses Anthropic Claude Sonnet 4 via direct fetch (no SDK install needed).
// Server-side only — ANTHROPIC_API_KEY never reaches the browser.

import { NextResponse } from 'next/server';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';

interface ScoreReq {
  ticker: string;
  drug: string;
  indication: string;
  phase: string;
  sector: string;
  designations?: string[];
}

const SYSTEM_PROMPT = `You are a biotech scientific risk analyst trained on the MIT/BIO clinical development dataset and FDA approval patterns. You score drug development programs across 6 dimensions on a 1-5 scale (1 = Poor, 2 = Weak, 3 = Fair, 4 = Good, 5 = Strong).

The 6 dimensions and their rubrics:

**targetVal — Target Validation**
1: No preclinical data
2: Animal model only
3: Biomarker correlation
4: Genetic evidence (one study, e.g. GWAS hit)
5: Strong genetic + clinical PoC (Mendelian randomization, multiple replications)

**moa — Mechanism of Action**
1: First-in-class, unproven target
2: FIC with some PoC
3: Fast-follower, differentiated
4: Validated class, improved profile
5: Established mechanism, clear differentiation

**endpoint — Endpoint Quality**
1: Novel surrogate, no precedent
2: Surrogate, weak correlation to outcome
3: Accepted surrogate
4: Surrogate + hard endpoint co-primary
5: Hard clinical endpoint (OS, hospitalization, mortality)

**trial — Trial Design Rigor**
1: Single arm, no control
2: Single arm, historical control
3: Randomized vs placebo
4: RCT vs SoC, modest power
5: RCT vs SoC, well-powered, pre-specified analysis

**biomarker — Patient Selection**
1: Unselected, heterogeneous population
2: Loose clinical criteria
3: Clinical enrichment
4: Validated biomarker (companion diagnostic)
5: Genetically defined population

**safety — Safety Profile**
1: Multiple serious AEs in Ph1
2: DLTs observed, narrow therapeutic window
3: Manageable AEs, some discontinuations
4: Minor AEs, good tolerability
5: Clean safety, broad therapeutic index

CRITICAL RULES:
- Score based on what is publicly known about THIS specific drug, not on the company or platform reputation.
- If you do not have specific knowledge of this drug, set confidence to "low" and default to 3 (Fair) on dimensions where you cannot assess. NEVER hallucinate trial designs, endpoints, or genetic evidence.
- Confidence levels: "high" = you know this drug specifically (published trials, conference data); "medium" = you can infer from class/mechanism precedent; "low" = you are guessing from the indication alone.
- Reasoning must be 1 short sentence per dimension, citing specifics where possible (e.g., "TTR is genetically validated via Mendelian randomization studies" not "Strong target").
- Be honest about limits. If the program is too obscure to score reliably, say so in overall_note.

Output ONLY valid JSON in this exact shape, no markdown:
{
  "scores": { "targetVal": N, "moa": N, "endpoint": N, "trial": N, "biomarker": N, "safety": N },
  "reasoning": { "targetVal": "...", "moa": "...", "endpoint": "...", "trial": "...", "biomarker": "...", "safety": "..." },
  "confidence": { "targetVal": "high|medium|low", "moa": "...", "endpoint": "...", "trial": "...", "biomarker": "...", "safety": "..." },
  "overall_note": "Optional 1-sentence caveat about your knowledge of this program, only include if relevant"
}`;

export async function POST(req: Request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set in environment' }, { status: 500 });
    }

    const body = (await req.json()) as ScoreReq;
    const { ticker, drug, indication, phase, sector, designations } = body;

    if (!ticker || !drug || !indication || !phase) {
      return NextResponse.json({ error: 'Missing required fields: ticker, drug, indication, phase' }, { status: 400 });
    }

    const userMessage = `Score the following drug development program:

Company: ${ticker}
Drug: ${drug}
Indication: ${indication}
Phase: ${phase}
Sector: ${sector}
FDA designations: ${designations?.length ? designations.join(', ') : 'none'}

Provide ratings on all 6 dimensions following the rubric. Output ONLY the JSON object.`;

    const anthropicRes = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
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
    const text = data?.content?.[0]?.text ?? '';

    // Strip any accidental markdown fences
    const clean = text.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      console.error('Failed to parse Claude response as JSON:', clean);
      return NextResponse.json(
        { error: 'Could not parse AI response as JSON', raw: clean },
        { status: 502 }
      );
    }

    // Validate shape
    const dims = ['targetVal', 'moa', 'endpoint', 'trial', 'biomarker', 'safety'];
    if (!parsed.scores || dims.some(d => typeof parsed.scores[d] !== 'number')) {
      return NextResponse.json(
        { error: 'AI response missing required score fields', raw: parsed },
        { status: 502 }
      );
    }

    // Clamp scores to 1-5 in case of out-of-range outputs
    dims.forEach(d => {
      parsed.scores[d] = Math.max(1, Math.min(5, Math.round(parsed.scores[d])));
    });

    return NextResponse.json(parsed);
  } catch (e: any) {
    console.error('science-suggest route error:', e);
    return NextResponse.json({ error: e.message ?? 'Unknown error' }, { status: 500 });
  }
}