'use client';

import { useState } from 'react';
import styles from './Modal.module.css';

interface Props {
  onClose: () => void;
  onAdd: (company: any) => void;
  existingTickers: string[];
}

export default function QuickAddModal({ onClose, onAdd, existingTickers }: Props) {
  const [ticker, setTicker] = useState('');
  const [fetched, setFetched] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sector, setSector] = useState('oncology');
  const [drug, setDrug] = useState('');
  const [phase, setPhase] = useState('Phase 2');

  async function lookup() {
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    if (existingTickers.includes(t)) { setError(`${t} is already in your list.`); return; }
    setLoading(true); setError(''); setFetched(null);
    try {
      const r = await fetch(`/api/price?ticker=${t}`);
      const d = await r.json();
      if (d.error || !d.price) { setError(`Could not find ${t}. Check the ticker.`); }
      else { setFetched({ ...d, ticker: t }); }
    } catch { setError('Network error — try again.'); }
    setLoading(false);
  }

  function confirm() {
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
        enrollment: 100, primaryEndpoint: 'TBD', data: 'TBD',
        orphan: false, designations: [], peakSales: 1.0,
        science: { targetVal: 3, moa: 3, endpoint: 3, trial: 3, biomarker: 3, safety: 3 },
        catalysts: [],
      }],
    });
    onClose();
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <h3 className={styles.title}>{fetched ? fetched.name : 'Quick Add'}</h3>

        {!fetched ? (
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
                {loading ? 'Searching...' : 'Look up'}
              </button>
            </div>
            {error && <div className={styles.error}>{error}</div>}
          </>
        ) : (
          <>
            <div className={styles.priceRow}>
              <div><div className={styles.metaLabel}>Price</div><div className={styles.bigVal}>${fetched.price.toFixed(2)}</div></div>
              <div><div className={styles.metaLabel}>Change</div><div className={styles.bigVal} style={{color: fetched.change>=0?'var(--success)':'var(--danger)'}}>{fetched.change>=0?'+':''}{fetched.change.toFixed(1)}%</div></div>
              {fetched.mktCap && <div><div className={styles.metaLabel}>Mkt Cap</div><div className={styles.bigVal}>~${fetched.mktCap.toFixed(1)}B</div></div>}
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Sector</label>
              <select className={styles.select} value={sector} onChange={e => setSector(e.target.value)}>
                <option value="oncology">Oncology</option>
                <option value="immunology">Immunology</option>
                <option value="neurology">Neurology</option>
                <option value="rare">Rare Disease</option>
                <option value="cardio">Cardiology</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Lead Drug / Indication (optional)</label>
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

        <div className={styles.btns}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          {fetched && <button className={styles.primaryBtn} onClick={confirm}>Add to Pipeline</button>}
        </div>
      </div>
    </div>
  );
}
