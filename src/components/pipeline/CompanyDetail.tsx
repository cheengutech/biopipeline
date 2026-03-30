'use client';

import { useState } from 'react';
import { calcApprovalProb, calcScienceMultiplier, SCIENCE_DIMS, FDA_PROBS, SECTOR_MOD, DESIG_MOD, CRL_PATTERNS, FDA_COMPS, CATALYST_IMPACT } from '@/lib/constants';
import styles from './CompanyDetail.module.css';
import ScienceTab from './tabs/ScienceTab';
import CatalystTab from './tabs/CatalystTab';
import { PipelineTab, MonteCarloTab, ValuationTab } from './tabs/PipelineTab';

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

  const runway = (c.cash / c.burnRate).toFixed(1);
  const runwayColor = parseFloat(runway) >= 3 ? 'var(--success)' : parseFloat(runway) >= 1.5 ? 'var(--warn)' : 'var(--danger)';

  // pipeline score
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
        <div className={styles.priceBlock}>
          <div className={styles.price}>${livePrice.toFixed(2)}</div>
          <div className={styles.priceChange} style={{ color: liveChange >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {liveChange >= 0 ? '▲' : '▼'} {Math.abs(liveChange).toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Thesis / entry banner */}
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
          <div className={styles.statVal} style={{ color: 'var(--accent)' }}>${c.mktCap}B</div>
          <div className={styles.statHint}>rNPV ~${npv.toFixed(1)}B</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Cash Runway</div>
          <div className={styles.statVal} style={{ color: runwayColor }}>{runway}y</div>
          <div className={styles.statHint}>${c.cash}B · ${c.burnRate}B/yr</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Catalysts Ahead</div>
          <div className={styles.statVal} style={{ color: 'var(--purple)' }}>{upcoming}</div>
          <div className={styles.statHint}>{approved} approved · {lateStage} late-stage</div>
        </div>
      </div>

      {/* Tab bar */}
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

      {/* Tab content */}
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
