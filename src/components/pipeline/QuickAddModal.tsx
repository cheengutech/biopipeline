'use client';

import { useState } from 'react';
import styles from './Modal.module.css';

interface Props {
  onClose: () => void;
  onAdd: (company: any) => void;
  existingTickers: string[];
}

interface DiscoveredPipeline {
  pipeline: any[];
  financials: { mktCap: number | null; cash: number | null; burnRate: number | null };
  confidence: 'high' | 'medium' | 'low';
  sources: string[];
  overall_note?: string;
  last_refreshed: string;
}

const SECTORS = [
  { value: 'oncology',   label: 'Oncology'      },
  { value: 'immunology', label: 'Immunology'    },
  { value: 'neurology',  label: 'Neurology'     },
  { value: 'rare',       label: 'Rare Disease'  },
  { value: 'cardio',     label: 'Cardiology'    },
];

export default function QuickAddModal({ onClose, onAdd, existingTickers }: Props) {
  // Step state: 'lookup' → 'discovering' → 'review' → 'manual fallback'
  const [step, setStep] = useState<'lookup' | 'discovering' | 'review' | 'manual'>('lookup');
  const [ticker, setTicker] = useState('');
  const [fetched, setFetched] = useState<any>(null);
  const [discovered, setDiscovered] = useState<DiscoveredPipeline | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sector, setSector] = useState('oncology');

  // Manual fallback fields
  const [drug, setDrug] = useState('');
  const [phase, setPhase] = useState('Phase 2');

  // Review-screen edits: lets user remove drugs before saving
  const [includedDrugs, setIncludedDrugs] = useState<Set<number>>(new Set());

  async function lookup() {
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    if (existingTickers.includes(t)) { setError(`${t} is already in your list.`); return; }
    setLoading(true); setError(''); setFetched(null);
    try {
      const r = await fetch(`/api/price?ticker=${t}`);
      const d = await r.json();
      if (d.error || !d.price) {
        setError(`Could not find ${t}. Check the ticker.`);
      } else {
        setFetched({ ...d, ticker: t });
        // Default the sector based on what (if anything) Finnhub returns
        // (You could improve this by mapping Finnhub's industry to your sector enum)
        // Auto-trigger discovery
        runDiscover(t, d.name);
      }
    } catch {
      setError('Network error — try again.');
    }
    setLoading(false);
  }

  async function runDiscover(t: string, name?: string) {
    setStep('discovering');
    setError('');
    try {
      const r = await fetch('/api/pipeline-discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: t, companyName: name, sector }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error || 'Discovery failed');
        setStep('manual');
        return;
      }
      setDiscovered(data);
      // Default: include all discovered drugs
      setIncludedDrugs(new Set(data.pipeline.map((_: any, i: number) => i)));
      setStep('review');
    } catch (e: any) {
      setError(e.message || 'Network error during discovery');
      setStep('manual');
    }
  }

  function toggleDrug(idx: number) {
    setIncludedDrugs(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function confirmFromDiscovery() {
    if (!fetched || !discovered) return;
    const includedPipeline = discovered.pipeline.filter((_, i) => includedDrugs.has(i));
    if (includedPipeline.length === 0) {
      setError('Select at least one drug to add.');
      return;
    }
    const fin = discovered.financials;
    onAdd({
      name: fetched.name || fetched.ticker,
      ticker: fetched.ticker,
      sector,
      mktCap: fin.mktCap ?? fetched.mktCap ?? 1.0,
      price: fetched.price,
      priceChange: fetched.change,
      cash: fin.cash ?? (fetched.mktCap || 1.0) * 0.15,
      burnRate: fin.burnRate ?? (fetched.mktCap || 1.0) * 0.06,
      pipeline: includedPipeline,
      _discoverySource: { confidence: discovered.confidence, sources: discovered.sources, refreshed: discovered.last_refreshed },
    });
    onClose();
  }

  function confirmManual() {
    if (!fetched) return;
    const drugName = drug.split('/')[0].trim() || `${fetched.ticker}-001`;
    const indication = drug.split('/')[1]?.trim() || 'TBD';
    onAdd({
      name: fetched.name || fetched.ticker,
      ticker: fetched.ticker,
      sector,
      mktCap: fetched.mktCap || 1.0,
      price: fetched.price,
      priceChange: fetched.change,
      cash: (fetched.mktCap || 1.0) * 0.15,
      burnRate: (fetched.mktCap || 1.0) * 0.06,
      pipeline: [{
        drug: drugName, indication, phase,
        enrollment: 0, primaryEndpoint: 'TBD', data: 'TBD',
        orphan: false, designations: [], peakSales: 1.0,
        science: { targetVal: 3, moa: 3, endpoint: 3, trial: 3, biomarker: 3, safety: 3 },
        catalysts: [],
      }],
    });
    onClose();
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <h3 className={styles.title}>
          {step === 'lookup' && 'Quick Add'}
          {step === 'discovering' && '🔍 Discovering pipeline…'}
          {step === 'review' && (fetched?.name || 'Review pipeline')}
          {step === 'manual' && `${fetched?.name || ''} — Manual entry`}
        </h3>

        {/* STEP 1: Lookup */}
        {step === 'lookup' && (
          <>
            <div className={styles.row}>
              <input
                className={styles.input}
                placeholder="Ticker (e.g. IOVA)"
                value={ticker}
                onChange={e => setTicker(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && lookup()}
                maxLength={8}
                autoFocus
              />
              <button className={styles.primaryBtn} onClick={lookup} disabled={loading}>
                {loading ? 'Searching…' : 'Look up'}
              </button>
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                Sector (used for FDA base rates and CRL patterns)
              </label>
              <select
                className={styles.select}
                value={sector}
                onChange={e => setSector(e.target.value)}
                style={{ width: '100%' }}
              >
                {SECTORS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            {error && <div className={styles.error}>{error}</div>}
          </>
        )}

        {/* STEP 2: Discovering (loading) */}
        {step === 'discovering' && (
          <div style={{ padding: '28px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>◌</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
              Searching SEC filings, IR pipeline page, and ClinicalTrials.gov…
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', opacity: 0.7, marginTop: 8 }}>
              This usually takes 10-20 seconds.
            </div>
          </div>
        )}

        {/* STEP 3: Review */}
        {step === 'review' && discovered && fetched && (
          <>
            {/* Price + financials banner */}
            <div className={styles.priceRow}>
              <div>
                <div className={styles.metaLabel}>Price</div>
                <div className={styles.bigVal}>${fetched.price.toFixed(2)}</div>
              </div>
              <div>
                <div className={styles.metaLabel}>Change</div>
                <div className={styles.bigVal} style={{ color: fetched.change >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {fetched.change >= 0 ? '+' : ''}{fetched.change.toFixed(1)}%
                </div>
              </div>
              {discovered.financials.mktCap != null && (
                <div>
                  <div className={styles.metaLabel}>Mkt Cap</div>
                  <div className={styles.bigVal}>${discovered.financials.mktCap.toFixed(2)}B</div>
                </div>
              )}
            </div>

            {/* Confidence callout */}
            <div style={{
              padding: '10px 12px',
              marginBottom: 12,
              background: discovered.confidence === 'high'
                ? 'rgba(46,204,113,0.08)'
                : discovered.confidence === 'medium'
                ? 'rgba(247,180,67,0.08)'
                : 'rgba(232,69,74,0.08)',
              border: `1px solid ${discovered.confidence === 'high'
                ? 'rgba(46,204,113,0.3)'
                : discovered.confidence === 'medium'
                ? 'rgba(247,180,67,0.3)'
                : 'rgba(232,69,74,0.3)'}`,
              borderRadius: 6,
              fontSize: 11,
              color: 'var(--muted)',
              lineHeight: 1.5,
            }}>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                marginRight: 6,
                color: discovered.confidence === 'high' ? 'var(--success)' : discovered.confidence === 'medium' ? 'var(--warn)' : 'var(--danger)',
              }}>
                AI [{discovered.confidence} conf]
              </span>
              Found {discovered.pipeline.length} active program{discovered.pipeline.length === 1 ? '' : 's'}.
              {discovered.overall_note && <div style={{ marginTop: 4 }}>{discovered.overall_note}</div>}
            </div>

            {/* Pipeline list with toggle */}
            <div style={{
              maxHeight: 280,
              overflowY: 'auto',
              border: '1px solid var(--border)',
              borderRadius: 6,
              marginBottom: 12,
            }}>
              {discovered.pipeline.length === 0 && (
                <div style={{ padding: 16, fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
                  No active programs found. Try manual entry instead.
                </div>
              )}
              {discovered.pipeline.map((d, i) => (
                <label
                  key={i}
                  style={{
                    display: 'flex',
                    gap: 10,
                    padding: '10px 12px',
                    borderBottom: i < discovered.pipeline.length - 1 ? '1px solid var(--border)' : 'none',
                    cursor: 'pointer',
                    background: includedDrugs.has(i) ? 'rgba(0,229,180,0.04)' : 'transparent',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={includedDrugs.has(i)}
                    onChange={() => toggleDrug(i)}
                    style={{ marginTop: 2 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
                      <span style={{ fontWeight: 500, fontSize: 13 }}>{d.drug}</span>
                      <span style={{
                        fontSize: 10,
                        padding: '1px 6px',
                        borderRadius: 3,
                        background: 'rgba(77,110,245,0.15)',
                        color: 'var(--accent2)',
                        fontFamily: 'var(--font-mono)',
                      }}>
                        {d.phase}
                      </span>
                      {d.designations?.map((des: string) => (
                        <span key={des} style={{
                          fontSize: 10,
                          padding: '1px 5px',
                          borderRadius: 3,
                          background: 'rgba(247,180,67,0.15)',
                          color: 'var(--warn)',
                          fontFamily: 'var(--font-mono)',
                        }}>{des}</span>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {d.target && <span>{d.target} · </span>}
                      {d.indication}
                    </div>
                    {d.catalysts && d.catalysts.length > 0 && (
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3, opacity: 0.8 }}>
                        Next: {d.catalysts[0].label} ({d.catalysts[0].date})
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </div>

            {discovered.sources.length > 0 && (
              <details style={{ marginBottom: 12, fontSize: 11, color: 'var(--muted)' }}>
                <summary style={{ cursor: 'pointer', userSelect: 'none' }}>
                  Sources ({discovered.sources.length})
                </summary>
                <ul style={{ marginTop: 6, paddingLeft: 18, lineHeight: 1.6 }}>
                  {discovered.sources.map((s, i) => (
                    <li key={i}>
                      <a href={s} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent2)', wordBreak: 'break-all' }}>
                        {s}
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {error && <div className={styles.error}>{error}</div>}

            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, textAlign: 'center' }}>
              {includedDrugs.size} of {discovered.pipeline.length} drugs selected
              {' · '}
              <button
                onClick={() => setStep('manual')}
                style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 11, padding: 0, textDecoration: 'underline' }}
              >
                add manually instead
              </button>
            </div>
          </>
        )}

        {/* STEP 4: Manual fallback */}
        {step === 'manual' && fetched && (
          <>
            <div className={styles.priceRow}>
              <div><div className={styles.metaLabel}>Price</div><div className={styles.bigVal}>${fetched.price.toFixed(2)}</div></div>
              <div><div className={styles.metaLabel}>Change</div><div className={styles.bigVal} style={{ color: fetched.change >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fetched.change >= 0 ? '+' : ''}{fetched.change.toFixed(1)}%</div></div>
            </div>
            {error && <div className={styles.error}>{error}</div>}
            <div className={styles.formGroup}>
              <label className={styles.label}>Lead Drug / Indication</label>
              <input className={styles.input} placeholder="e.g. DRUG-001 / NSCLC" value={drug} onChange={e => setDrug(e.target.value)} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Phase</label>
              <select className={styles.select} value={phase} onChange={e => setPhase(e.target.value)}>
                <option>Phase 1</option><option>Phase 2</option>
                <option>Phase 3</option><option>NDA/BLA</option>
              </select>
            </div>
          </>
        )}

        {/* Footer buttons */}
        <div className={styles.btns}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          {step === 'review' && discovered && (
            <button
              className={styles.primaryBtn}
              onClick={confirmFromDiscovery}
              disabled={includedDrugs.size === 0}
            >
              Add {includedDrugs.size > 0 ? `(${includedDrugs.size}) ` : ''}to Pipeline
            </button>
          )}
          {step === 'manual' && (
            <button className={styles.primaryBtn} onClick={confirmManual}>Add to Pipeline</button>
          )}
        </div>
      </div>
    </div>
  );
}