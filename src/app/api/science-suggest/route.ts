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

const SYSTEM_PROMPT = `You are a strict biotech scientific risk analyst. You score drug development programs on 6 dimensions (1-5) by LITERALLY matching evidence to a rubric. You are NOT predicting approval probability — that is computed separately. Your job is rubric-matching only.

═══════════════════════════════════════════════════════════════
THE 6 DIMENSIONS — match the EVIDENCE to the rubric LITERALLY
═══════════════════════════════════════════════════════════════

**targetVal — Target Validation**
1: No preclinical data
2: Animal model only
3: Biomarker correlation OR clinical efficacy without molecular target validation
4: Genetic evidence (one study — GWAS hit, Mendelian randomization)
5: Strong genetic + clinical PoC (multiple replications, gold standard)

CRITICAL RULES for targetVal:
- "The drug works in patients" is NOT target validation — that's mechanism evidence. Score it 3 max.
- Cell therapies (CAR-T, TIL, NK) typically score 3 here unless there is genetic evidence about the antigen target itself (e.g., CD19 has clinical PoC = 3, BCMA same = 3).
- Score 4 requires GENETIC evidence (GWAS, Mendelian randomization, rare variant studies linking the target to the disease).
- Score 5 is reserved for targets with multiple replicated genetic associations + clinical proof (e.g., PCSK9, TTR for ATTR amyloidosis, CFTR for CF).

**moa — Mechanism of Action**
1: First-in-class, unproven target
2: FIC with some PoC
3: Fast-follower, differentiated
4: Validated class, improved profile
5: Established mechanism, clear differentiation

**endpoint — Endpoint Quality**
1: Novel surrogate, no precedent
2: Surrogate with weak correlation to outcome
3: Accepted surrogate (ORR, PFS, biomarker reduction, A1c, LDL-C)
4: Surrogate + hard endpoint as co-primary
5: Hard clinical endpoint as primary (OS, hospitalization, mortality, CV death)

CRITICAL RULES for endpoint:
- ORR (Objective Response Rate) is the canonical EXAMPLE of an accepted surrogate. Score 3, NEVER 4 or 5.
- PFS (Progression-Free Survival) is also an accepted surrogate. Score 3, NEVER 5.
- Score 4 requires the protocol to have BOTH a surrogate primary AND a hard clinical endpoint as co-primary or key secondary.
- Score 5 is reserved for trials where the PRIMARY endpoint is OS, mortality, MACE, or hospitalization. If you cannot name a hard clinical primary endpoint, do not score 5.
- "Established for accelerated approval" is true of many surrogates — that does NOT promote them to a hard endpoint. Accelerated approval EXISTS specifically because surrogates are weaker.

**trial — Trial Design Rigor**
1: Single arm, no control
2: Single arm, historical or external control
3: Randomized vs placebo
4: RCT vs SoC, modest power
5: RCT vs SoC, well-powered, pre-specified analysis plan

CRITICAL RULES for trial:
- A single-arm trial CANNOT score above 2. Period. "Typical for the indication" or "standard for accelerated approval" does not promote the score.
- TIL therapy registrational trials are typically single-arm — that means score 2.
- Most oncology Phase 2 efficacy trials are single-arm — score 2.
- Score 3+ requires randomization. If you are uncertain whether the trial is randomized, default to 2 with low confidence.
- Score 4-5 requires both randomization AND a contemporaneous active comparator (SoC).

**biomarker — Patient Selection**
1: Unselected, heterogeneous population
2: Loose clinical criteria
3: Clinical enrichment (e.g., recurrent/refractory after prior therapy)
4: Validated biomarker (companion diagnostic, e.g., HER2+, EGFR mutation, MSI-high)
5: Genetically defined population (single Mendelian variant, e.g., CFTR genotype, TTR mutation)

**safety — Safety Profile**
1: Multiple serious AEs in Ph1
2: DLTs observed, narrow therapeutic window
3: Manageable AEs, some discontinuations
4: Minor AEs, good tolerability
5: Clean safety, broad therapeutic index

CRITICAL RULES for safety:
- Cell therapies that require lymphodepletion conditioning have meaningful AE burden — usually 3, sometimes 4 if the program has been clean.
- CAR-T programs with CRS/ICANS history score 2-3, not higher.

═══════════════════════════════════════════════════════════════
META-RULES
═══════════════════════════════════════════════════════════════

1. Match the EVIDENCE to the rubric. Do NOT score based on:
   - The drug's commercial prospects
   - Whether you think FDA will approve it
   - Whether the company has a good reputation
   - Whether the program has Breakthrough Designation (designation is scored elsewhere)

2. If the rubric says "single-arm = 2" and the trial is single-arm, the answer is 2 — even if a PDUFA is imminent and approval looks likely.

3. The 6-dimension framework EXISTS to separate underlying science strength from approval probability. They are different. Approval-probability bias defeats the purpose of scoring.

4. CONFIDENCE LEVELS:
   - "high" = you know this drug specifically (published trials, conference data you can cite)
   - "medium" = you can infer from class/mechanism/sector precedent
   - "low" = you are guessing — return 3 and flag in overall_note

5. If you do not have specific knowledge of this drug, set ALL confidences to "low", default to 3 across the board, and explain the gap in overall_note. NEVER fabricate trial details, endpoints, or genetic evidence.

6. Reasoning must be ONE short sentence per dimension, citing specifics where possible. Bad: "Strong target." Good: "TTR has Mendelian randomization evidence and approved precedent (Onpattro)."

7. If the AI's reasoning would justify scoring AGAINST the rubric (e.g., "ORR is established in oncology so I'll score 5"), STOP and re-anchor to the rubric. Reason: ORR = accepted surrogate = 3.

═══════════════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════════════

Output ONLY valid JSON, no markdown, no commentary:

{
  "scores": { "targetVal": N, "moa": N, "endpoint": N, "trial": N, "biomarker": N, "safety": N },
  "reasoning": { "targetVal": "...", "moa": "...", "endpoint": "...", "trial": "...", "biomarker": "...", "safety": "..." },
  "confidence": { "targetVal": "high|medium|low", "moa": "...", "endpoint": "...", "trial": "...", "biomarker": "...", "safety": "..." },
  "overall_note": "Optional 1-sentence caveat — only include if your knowledge of this program is limited or if a rating warrants explanation."
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

    const userMessage = `Score this drug program by literal rubric-matching:

Company: ${ticker}
Drug: ${drug}
Indication: ${indication}
Phase: ${phase}
Sector: ${sector}
FDA designations: ${designations?.length ? designations.join(', ') : 'none'}

Remember:
- ORR/PFS = accepted surrogate = score 3 (NEVER 5)
- Single-arm trials = score 2 (regardless of "typical for setting")
- Target validation 4+ requires GENETIC evidence, not just clinical efficacy
- If uncertain about specifics, score 3 with low confidence

Output ONLY the JSON object.`;

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