'use client';

import { useState } from 'react';
import styles from './Modal.module.css';

interface Props {
  onClose: () => void;
  onAdd: (company: any) => void;
  existingTickers: string[];
}

interface DrugEntry {
  drug: string; indication: string; phase: string; catalyst: string;
}

export default function OnboardModal({ onClose, onAdd, existingTickers }: Props) {
  const [step, setStep] = useState(1);
  const [ticker, setTicker] = useState('');
  const [fetchedData, setFetchedData] = useState<any>(null);
  const [sector, setSector] = useState('oncology');
  const [cash, setCash] = useState('');
  const [burn, setBurn] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [drugs, setDrugs] = useState<DrugEntry[]>([{ drug: '', indication: '', phase: 'Phase 2', catalyst: '' }]);
  const [thesis, setThesis] = useState('');
  const [risks, setRisks] = useState('');
  const [entryTarget, setEntryTarget] = useState('');

  async function step1Next() {
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    setLoading(true); setFetchError('');
    try {
      const r = await fetch(`/api/price?ticker=${t}`);
      const d = await r.json();
      if (d.error || !d.price) { setFetchError(`Could not find ${t}.`); setLoading(false); return; }
      setFetchedData({ ...d, ticker: t });
    } catch { setFetchError('Network error.'); setLoading(false); return; }
    setLoading(false);
    setStep(2);
  }

  function addDrug() { setDrugs([...drugs, { drug: '', indication: '', phase: 'Phase 2', catalyst: '' }]); }
  function removeDrug(i: number) { if (drugs.length > 1) setDrugs(drugs.filter((_,idx) => idx !== i)); }
  function updateDrug(i: number, field: keyof DrugEntry, val: string) {
    setDrugs(drugs.map((d, idx) => idx === i ? { ...d, [field]: val } : d));
  }

  function finish() {
    const pipeline = drugs.filter(d => d.drug.trim()).map(d => ({
      drug: d.drug.trim(),
      indication: d.indication.trim() || 'TBD',
      phase: d.phase,
      enrollment: 100, primaryEndpoint: 'TBD',
      data: d.catalyst || 'TBD',
      orphan: false, designations: [], peakSales: 1.0,
      science: { targetVal: 3, moa: 3, endpoint: 3, trial: 3, biomarker: 3, safety: 3 },
      catalysts: d.catalyst ? [{ type: 'data', label: 'Data Readout', date: d.catalyst }] : [],
    }));
    const mktCap = fetchedData?.mktCap || 1.0;
    onAdd({
      name: fetchedData?.name || ticker.trim().toUpperCase(),
      ticker: ticker.trim().toUpperCase(),
      sector,
      mktCap,
      price: fetchedData?.price || 0,
      priceChange: fetchedData?.change || 0,
      cash: parseFloat(cash) || mktCap * 0.15,
      burnRate: parseFloat(burn) || mktCap * 0.06,
      pipeline,
      thesis: thesis.trim() || undefined,
      risks: risks.trim() || undefined,
      entryTarget: parseFloat(entryTarget) || undefined,
    });
    onClose();
  }

  const stepLabels = ['Company Info', 'Pipeline', 'Thesis'];

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} style={{ width: 520, maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        {/* Step indicator */}
        <div className={styles.steps}>
          {[1,2,3].map(s => (
            <div key={s} className={`${styles.step} ${s < step ? styles.stepDone : s === step ? styles.stepCurrent : ''}`} />
          ))}
        </div>
        <h3 className={styles.title}>{stepLabels[step-1]}</h3>
        <p className={styles.stepSub}>
          {step===1 && 'Enter the ticker — we\'ll pull live price and company info from Finnhub.'}
          {step===2 && 'Add each pipeline asset. You can refine science scores after adding.'}
          {step===3 && 'Capture your thesis and risk factors. Surfaces in the company view.'}
        </p>

        {/* Step 1 */}
        {step === 1 && (
          <>
            <div className={styles.formGroup}>
              <label className={styles.label}>Ticker Symbol</label>
              <input
                className={styles.input} placeholder="IOVA" value={ticker}
                onChange={e => setTicker(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && step1Next()}
                maxLength={8} autoFocus style={{ fontSize: 16, fontFamily: 'var(--font-mono)' }}
              />
              {fetchedData && (
                <div className={styles.fetchSuccess}>
                  ✓ {fetchedData.name} — ${fetchedData.price.toFixed(2)} ({fetchedData.change >= 0 ? '+' : ''}{fetchedData.change.toFixed(1)}%)
                </div>
              )}
              {fetchError && <div className={styles.error}>{fetchError}</div>}
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Sector</label>
              <select className={styles.select} value={sector} onChange={e => setSector(e.target.value)}>
                <option value="oncology">Oncology</option><option value="immunology">Immunology</option>
                <option value="neurology">Neurology</option><option value="rare">Rare Disease</option>
                <option value="cardio">Cardiology</option>
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Cash ($B)</label>
                <input className={styles.input} type="number" placeholder="0.5" value={cash} onChange={e => setCash(e.target.value)} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Burn Rate ($B/yr)</label>
                <input className={styles.input} type="number" placeholder="0.15" value={burn} onChange={e => setBurn(e.target.value)} />
              </div>
            </div>
          </>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <>
            {drugs.map((d, i) => (
              <div key={i} className={styles.drugEntry}>
                <div className={styles.drugHeader}>
                  <span className={styles.drugLabel}>Asset {i+1}</span>
                  <button className={styles.removeBtn} onClick={() => removeDrug(i)} disabled={drugs.length === 1}>×</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 8, marginBottom: 8 }}>
                  <input className={styles.input} placeholder="Drug name" value={d.drug} onChange={e => updateDrug(i,'drug',e.target.value)} />
                  <input className={styles.input} placeholder="Indication" value={d.indication} onChange={e => updateDrug(i,'indication',e.target.value)} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <select className={styles.select} value={d.phase} onChange={e => updateDrug(i,'phase',e.target.value)}>
                    {['Phase 1','Phase 2','Phase 3','NDA/BLA','Approved'].map(p => <option key={p}>{p}</option>)}
                  </select>
                  <input className={styles.input} placeholder="Catalyst (Q3 2026)" value={d.catalyst} onChange={e => updateDrug(i,'catalyst',e.target.value)} />
                </div>
              </div>
            ))}
            <button className={styles.addDrugBtn} onClick={addDrug}>+ Add Another Asset</button>
          </>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <>
            <div className={styles.formGroup}>
              <label className={styles.label}>Investment Thesis</label>
              <textarea className={styles.textarea} rows={3} placeholder="Why are you looking at this name? What's the catalyst?" value={thesis} onChange={e => setThesis(e.target.value)} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Key Risks</label>
              <textarea className={styles.textarea} rows={2} placeholder="Competing drug, cash runway, CMC concerns..." value={risks} onChange={e => setRisks(e.target.value)} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Target Entry Price (optional)</label>
              <input className={styles.input} type="number" placeholder="e.g. 3.20" value={entryTarget} onChange={e => setEntryTarget(e.target.value)} />
            </div>
          </>
        )}

        {/* Nav buttons */}
        <div className={styles.btns}>
          <button className={styles.cancelBtn} onClick={step === 1 ? onClose : () => setStep(step - 1)}>
            {step === 1 ? 'Cancel' : '← Back'}
          </button>
          {step < 3 ? (
            <button className={styles.primaryBtn} onClick={step === 1 ? step1Next : () => setStep(3)} disabled={loading}>
              {loading ? 'Fetching...' : step === 1 ? 'Next — Pipeline →' : 'Next — Thesis →'}
            </button>
          ) : (
            <button className={styles.primaryBtn} onClick={finish}>Add to arbi.to ✓</button>
          )}
        </div>
      </div>
    </div>
  );
}
