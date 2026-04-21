'use client';

import { useState } from 'react';
import { calcApprovalProb, calcScienceMultiplier, SCIENCE_DIMS, FDA_PROBS, SECTOR_MOD, DESIG_MOD, CRL_PATTERNS, FDA_COMPS, CATALYST_IMPACT } from '@/lib/constants';
import { supabase } from '@/lib/supabase';
import styles from './CompanyDetail.module.css';
import ScienceTab from './tabs/ScienceTab';
import CatalystTab from './tabs/CatalystTab';
import { PipelineTab, MonteCarloTab, ValuationTab } from './tabs/PipelineTab';

// ── Number formatting helpers ──────────────────────────────────────────────
function fmtBillions(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—';
  if (Math.abs(n) >= 1) return `$${n.toFixed(2)}B`;
  return `$${(n * 1000).toFixed(0)}M`;
}
function fmtBillionsPerYear(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—';
  if (Math.abs(n) >= 1) return `$${n.toFixed(2)}B/yr`;
  return `$${(n * 1000).toFixed(0)}M/yr`;
}
function fmtYears(n: number | null | undefined): string {
  if (n == null || isNaN(n) || !isFinite(n)) return '—';
  return `${n.toFixed(1)}y`;
}

const TABS = [
  { id: 'catalyst',    label: 'Catalyst Timeline' },
  { id: 'science',     label: 'Science Risk' },
  { id: 'pipeline',    label: 'Pipeline' },
  { id: 'montecarlo',  label: 'Monte Carlo' },
  { id: 'valuation',   label: 'Valuation' },
];

interface Props {
  company: any;
  price: any;
  scienceScores: Record<string, Record<string, number>>;
  notes?: { thesis: string; risks: string };
  activeTab: string;
  onTabChange: (tab: string) => void;
  onScienceScore: (key: string, dim: string, val: number) => void;
  onSaveNotes: (ticker: string, thesis: string, risks: string) => void;
}

export default function CompanyDetail({
  company, price, scienceScores, notes, activeTab, onTabChange, onScienceScore, onSaveNotes
}: Props) {
  const c = company;
  const livePrice  = price?.price  ?? c.price;
  const liveChange = price?.change ?? c.priceChange ?? 0;
  // Prefer Finnhub's live mktCap over the stored one, which may be stale
  const liveMktCap = price?.mktCap ?? c.mktCap;

  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshResult, setRefreshResult] = useState<{ added: string[]; removed: string[]; updated: string[] } | null>(null);

  async function handleRefreshPipeline() {
    setRefreshing(true);
    setRefreshError(null);
    setRefreshResult(null);
    try {
      const r = await fetch('/api/pipeline-discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: c.ticker, companyName: c.name, sector: c.sector }),
      });
      const data = await r.json();
      if (!r.ok) {
        setRefreshError(data.error || 'Refresh failed');
        return;
      }
      const oldDrugs = new Set((c.pipeline ?? []).map((d: any) => d.drug));
      const newDrugs = new Set(data.pipeline.map((d: any) => d.drug));
      const added = data.pipeline.filter((d: any) => !oldDrugs.has(d.drug)).map((d: any) => d.drug);
      const removed = (c.pipeline ?? []).filter((d: any) => !newDrugs.has(d.drug)).map((d: any) => d.drug);
      const updated = data.pipeline.filter((d: any) => oldDrugs.has(d.drug)).map((d: any) => d.drug);

      // Merge: preserve user-edited science scores and other fields
      const mergedPipeline = data.pipeline.map((newDrug: any) => {
        const existing = (c.pipeline ?? []).find((d: any) => d.drug === newDrug.drug);
        if (existing) {
          return {
            ...newDrug,
            science: existing.science ?? newDrug.science,
            peakSales: existing.peakSales ?? newDrug.peakSales,
            enrollment: existing.enrollment ?? newDrug.enrollment,
            primaryEndpoint: existing.primaryEndpoint ?? newDrug.primaryEndpoint,
          };
        }
        return newDrug;
      });

      // Save to Supabase — mktCap stays from Finnhub (liveMktCap), NEVER from AI
      const { error: dbErr } = await supabase.from('watchlist').upsert({
        ticker: c.ticker,
        name: c.name,
        sector: c.sector,
        mkt_cap: liveMktCap,                          // Finnhub canonical
        cash: data.financials.cash ?? c.cash,         // AI fills in
        burn_rate: data.financials.burnRate ?? c.burnRate, // AI fills in
        pipeline: mergedPipeline,
      }, { onConflict: 'ticker' });

      if (dbErr) {
        setRefreshError('Saved but DB error: ' + dbErr.message);
      }

      setRefreshResult({ added, removed, updated });
    } catch (e: any) {
      setRefreshError(e.message || 'Network error');
    } finally {
      setRefreshing(false);
    }
  }

  // rNPV
  let npv = 0;
  c.pipeline.forEach((d: any) => {
    const key = c.ticker + '_' + d.drug;
    npv += calcApprovalProb(d, c.sector, scienceScores[key] ?? d.science) * d.peakSales * 3.0 * 0.32;
  });

  const approved  = c.pipeline.filter((d: any) => d.phase === 'Approved').length;
  const lateStage = c.pipeline.filter((d: any) => d.phase === 'Phase 3' || d.phase === 'NDA/BLA').length;
  const NOW = new Date(2026, 2, 28);
  const upcoming  = c.pipeline.flatMap((d: any) => d.catalysts ?? []).filter((cat: any) => {
    const m = cat.date?.match(/Q(\d)\s+(\d{4})/);
    if (!m) return false;
    const dt = new Date(parseInt(m[2]), (parseInt(m[1])-1)*3+1, 15);
    return dt > NOW;
  }).length;

  const runwayYears = c.cash / c.burnRate;
  const runwayColor = runwayYears >= 3 ? 'var(--success)' : runwayYears >= 1.5 ? 'var(--warn)' : 'var(--danger)';

  let scoreSum = 0;
  c.pipeline.forEach((d: any) => {
    const key = c.ticker + '_' + d.drug;
    scoreSum += calcApprovalProb(d, c.sector, scienceScores[key] ?? d.science);
  });
  const avgScore = scoreSum / c.pipeline.length;
  const runwayScore = Math.min(c.cash / c.burnRate / 10, 1.0);
  const score = Math.round((avgScore * 0.7 + runwayScore * 0.3) * 100);
  const scoreColor = score >= 60 ? 'var(--success)' : score >= 35 ? 'var(--warn)' : 'var(--danger)';

  return (
    <div>
      {/* Company header */}
      <div className={styles.header}>
        <div>
          <div className={styles.companyName}>{c.name}</div>
          <div className={styles.companyMeta}>
            <span className={styles.ticker}>{c.ticker}</span>
            <span className={styles.dot}>·</span>
            <span className={styles.sector}>{c.sector.charAt(0).toUpperCase()+c.sector.slice(1)}</span>
            {price && <span className={styles.liveTag}>Live</span>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={handleRefreshPipeline}
            disabled={refreshing}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid var(--accent)',
              background: refreshing ? 'rgba(0,229,180,0.1)' : 'rgba(0,229,180,0.18)',
              color: 'var(--accent)',
              cursor: refreshing ? 'wait' : 'pointer',
              fontSize: 11,
              fontWeight: 500,
              fontFamily: 'var(--font-mono)',
              letterSpacing: 0.4,
              transition: 'all .15s',
            }}
            title="Re-discover pipeline from public sources"
          >
            {refreshing ? '◌ refreshing…' : '🔄 refresh pipeline'}
          </button>
          <div className={styles.priceBlock}>
            <div className={styles.price}>${livePrice.toFixed(2)}</div>
            <div className={styles.priceChange} style={{ color: liveChange >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {liveChange >= 0 ? '▲' : '▼'} {Math.abs(liveChange).toFixed(1)}%
            </div>
          </div>
        </div>
      </div>

      {refreshError && (
        <div style={{
          padding: '8px 12px',
          marginBottom: 12,
          background: 'rgba(232,69,74,0.1)',
          border: '1px solid rgba(232,69,74,0.4)',
          borderRadius: 6,
          fontSize: 12,
          color: 'var(--danger)',
        }}>
          ⚠ {refreshError}
        </div>
      )}
      {refreshResult && (
        <div style={{
          padding: '10px 14px',
          marginBottom: 12,
          background: 'rgba(0,229,180,0.08)',
          border: '1px solid rgba(0,229,180,0.3)',
          borderRadius: 6,
          fontSize: 12,
          color: 'var(--text)',
          lineHeight: 1.6,
        }}>
          <div style={{ marginBottom: 4 }}>
            ✓ Pipeline refreshed.
            {refreshResult.added.length > 0 && (
              <span style={{ color: 'var(--success)', marginLeft: 8 }}>
                +{refreshResult.added.length} new ({refreshResult.added.join(', ')})
              </span>
            )}
            {refreshResult.removed.length > 0 && (
              <span style={{ color: 'var(--warn)', marginLeft: 8 }}>
                −{refreshResult.removed.length} removed ({refreshResult.removed.join(', ')})
              </span>
            )}
            {refreshResult.updated.length > 0 && (
              <span style={{ color: 'var(--muted)', marginLeft: 8 }}>
                ~{refreshResult.updated.length} updated
              </span>
            )}
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)', fontStyle: 'italic' }}>
            Reload the page to see the changes reflected in the UI.
          </div>
        </div>
      )}

      {(notes?.thesis || c.thesis) && (
        <div className={styles.thesisBanner}>
          <div className={styles.thesisLabel}>YOUR THESIS</div>
          <div className={styles.thesisText}>{notes?.thesis || c.thesis}</div>
          {(notes?.risks || c.risks) && (
            <div className={styles.risksText}>⚠ Risks: {notes?.risks || c.risks}</div>
          )}
        </div>
      )}
      {c.entryTarget && (
        <div className={styles.entryBanner}>
          <span>Target entry: <strong>${c.entryTarget.toFixed(2)}</strong></span>
          <span>Current: <strong style={{ color: livePrice <= c.entryTarget ? 'var(--success)' : 'var(--warn)' }}>${livePrice.toFixed(2)}</strong></span>
          <span style={{ color: livePrice <= c.entryTarget ? 'var(--success)' : 'var(--warn)' }}>
            {livePrice <= c.entryTarget ? '✓ At/below target' : 'Above target'}
          </span>
        </div>
      )}

      {/* Stats row */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Pipeline Score</div>
          <div className={styles.statVal} style={{ color: scoreColor }}>{score}<span className={styles.statSub}>/100</span></div>
          <div className={styles.statHint}>Science-adjusted</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Market Cap</div>
          <div className={styles.statVal} style={{ color: 'var(--accent)' }}>{fmtBillions(liveMktCap)}</div>
          <div className={styles.statHint}>rNPV ~{fmtBillions(npv)}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Cash Runway</div>
          <div className={styles.statVal} style={{ color: runwayColor }}>{fmtYears(runwayYears)}</div>
          <div className={styles.statHint}>{fmtBillions(c.cash)} · {fmtBillionsPerYear(c.burnRate)}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Catalysts Ahead</div>
          <div className={styles.statVal} style={{ color: 'var(--purple)' }}>{upcoming}</div>
          <div className={styles.statHint}>{approved} approved · {lateStage} late-stage</div>
        </div>
      </div>

      <div className={styles.tabBar}>
        {TABS.map(t => (
          <button
            key={t.id}
            className={`${styles.tab} ${activeTab === t.id ? styles.tabActive : ''}`}
            onClick={() => onTabChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={styles.tabContent}>
        {activeTab === 'catalyst'   && <CatalystTab   company={c} scienceScores={scienceScores} />}
        {activeTab === 'science'    && <ScienceTab    company={c} scienceScores={scienceScores} onScore={onScienceScore} />}
        {activeTab === 'pipeline'   && <PipelineTab   company={c} scienceScores={scienceScores} />}
        {activeTab === 'montecarlo' && <MonteCarloTab company={c} scienceScores={scienceScores} />}
        {activeTab === 'valuation'  && <ValuationTab  company={c} scienceScores={scienceScores} livePrice={livePrice} onSaveNotes={onSaveNotes} notes={notes} />}
      </div>
    </div>
  );
}