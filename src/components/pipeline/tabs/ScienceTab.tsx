'use client';

import { useState, useEffect, useRef } from 'react';
import { calcApprovalProb, calcScienceMultiplier, SCIENCE_DIMS, FDA_PROBS, SECTOR_MOD, DESIG_MOD, CRL_PATTERNS, FDA_COMPS } from '@/lib/constants';
import styles from './Tabs.module.css';
import { Chart, RadarController, RadialLinearScale, PointElement, LineElement, Filler } from 'chart.js';
Chart.register(RadarController, RadialLinearScale, PointElement, LineElement, Filler);

interface Props {
  company: any;
  scienceScores: Record<string, Record<string, number>>;
  onScore: (key: string, dim: string, val: number) => void;
}

export default function ScienceTab({ company, scienceScores, onScore }: Props) {
  const c = company;
  const activeDrugs = c.pipeline.filter((d: any) => d.phase !== 'Approved');
  const [activeDrug, setActiveDrug] = useState<string>(activeDrugs[0]?.drug ?? c.pipeline[0]?.drug);
  const radarRef = useRef<HTMLCanvasElement>(null);
  const radarChart = useRef<Chart|null>(null);

  const drug = c.pipeline.find((d: any) => d.drug === activeDrug) ?? c.pipeline[0];
  if (!drug) return <div style={{color:'var(--muted)'}}>No pipeline assets.</div>;

  const key = c.ticker + '_' + drug.drug;
  const scores = scienceScores[key] ?? drug.science ?? {};

  const baseProb = FDA_PROBS[drug.phase]?.toApproval ?? 1.0;
  const sectorAdj = baseProb * (SECTOR_MOD[c.sector] ?? 1.0);
  let desigAdj = sectorAdj;
  (drug.designations ?? []).forEach((d: string) => { desigAdj *= DESIG_MOD[d] ?? 1.0; });
  const sciMult = calcScienceMultiplier(scores);
  const finalProb = Math.min(desigAdj * sciMult, 0.97);

  let rawScore = 0;
  SCIENCE_DIMS.forEach(d => { rawScore += (scores[d.id] ?? 3) * d.weight; });
  const pct = Math.round(((rawScore-1)/4)*100);
  const scoreColor = pct >= 65 ? 'var(--success)' : pct >= 40 ? 'var(--warn)' : 'var(--danger)';

  // Radar chart
  useEffect(() => {
    if (!radarRef.current) return;
    if (radarChart.current) { radarChart.current.destroy(); radarChart.current = null; }
    const data = SCIENCE_DIMS.map(d => scores[d.id] ?? 3);
    const labels = SCIENCE_DIMS.map(d => d.label.split(' ').slice(0,2).join(' '));
    radarChart.current = new Chart(radarRef.current, {
      type: 'radar',
      data: {
        labels,
        datasets: [
          { label: 'Science', data, backgroundColor: 'rgba(0,229,180,0.15)', borderColor: '#00e5b4', pointBackgroundColor: '#00e5b4', pointRadius: 4, borderWidth: 2 },
          { label: 'Baseline', data: SCIENCE_DIMS.map(() => 3), backgroundColor: 'rgba(122,128,153,0.05)', borderColor: 'rgba(122,128,153,0.3)', pointRadius: 0, borderWidth: 1, borderDash: [4,4] } as any,
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { r: { min:0, max:5, ticks: { stepSize:1, color:'#7a8099', font:{size:10}, backdropColor:'transparent' }, grid: { color:'rgba(255,255,255,0.06)' }, angleLines: { color:'rgba(255,255,255,0.06)' }, pointLabels: { color:'#7a8099', font:{size:10} } } },
      },
    });
  }, [activeDrug, JSON.stringify(scores)]);

  const comps = FDA_COMPS[c.sector] ?? [];
  const crls = CRL_PATTERNS[c.sector] ?? [];
  const SCORE_LABELS: Record<number,string> = {1:'Poor',2:'Weak',3:'Fair',4:'Good',5:'Strong'};

  return (
    <div>
      {/* Drug selector */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:20 }}>
        {c.pipeline.map((d: any) => (
          <button key={d.drug}
            onClick={() => setActiveDrug(d.drug)}
            style={{ padding:'6px 12px', borderRadius:6, border:`1px solid ${activeDrug===d.drug?'var(--accent2)':'var(--border2)'}`, background: activeDrug===d.drug?'rgba(77,110,245,0.15)':'transparent', color: activeDrug===d.drug?'var(--accent2)':'var(--muted)', cursor:'pointer', fontSize:12 }}
          >
            {d.drug} <span style={{fontSize:10,opacity:.7}}>({d.phase})</span>
          </button>
        ))}
      </div>

      <div className={styles.scienceGrid}>
        {/* Left: dimensions */}
        <div>
          <div className={styles.sectionTitle}>{drug.drug} — Science Dimensions <span className={styles.badge} style={{background:'rgba(0,200,212,0.2)',color:'var(--teal)'}}>Adjustable</span></div>
          {SCIENCE_DIMS.map(dim => {
            const val = scores[dim.id] ?? 3;
            const fc = val >= 4 ? 'var(--success)' : val >= 3 ? 'var(--warn)' : 'var(--danger)';
            return (
              <div key={dim.id} className={styles.sciDim}>
                <div className={styles.sciDimHeader}>
                  <span className={styles.sciDimLabel}>{dim.label}</span>
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:12, color:fc }}>{val}/5</span>
                </div>
                <div style={{ height:5, borderRadius:3, background:'var(--border2)', overflow:'hidden', marginBottom:4 }}>
                  <div style={{ height:'100%', width:`${val*20}%`, background:fc, borderRadius:3, transition:'width .4s' }}/>
                </div>
                <div style={{ fontSize:11, color:'var(--muted)', marginBottom:6, lineHeight:1.5 }}>{dim.desc}</div>
                <div style={{ display:'flex', gap:3 }}>
                  {[1,2,3,4,5].map(n => (
                    <button key={n}
                      onClick={() => onScore(key, dim.id, n)}
                      style={{ flex:1, padding:'3px 0', borderRadius:3, border:`1px solid ${val===n?fc:'var(--border)'}`, background: val===n?`${fc}22`:'transparent', color: val===n?fc:'var(--muted)', cursor:'pointer', fontSize:10, fontFamily:'var(--font-mono)', transition:'all .15s' }}
                    >
                      {n} — {SCORE_LABELS[n]}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: summary + radar */}
        <div>
          <div className={styles.sectionTitle}>Science-Adjusted Probability</div>
          <div className={styles.sciSummary}>
            <div style={{ display:'flex', alignItems:'baseline', gap:10, marginBottom:6 }}>
              <div style={{ fontFamily:'var(--font-display)', fontSize:46, fontWeight:800, color:scoreColor }}>{pct}</div>
              <div style={{ fontSize:13, color:'var(--muted)' }}>/ 100 science score</div>
            </div>
            <div style={{ height:8, borderRadius:4, background:'var(--border)', overflow:'hidden', marginBottom:8 }}>
              <div style={{ height:'100%', width:`${pct}%`, background:scoreColor, borderRadius:4, transition:'width .5s' }}/>
            </div>
            <div style={{ fontSize:11, color:'var(--muted)', marginBottom:14 }}>
              Science multiplier: <span style={{ fontFamily:'var(--font-mono)', color: sciMult>=1?'var(--success)':'var(--danger)' }}>{sciMult.toFixed(2)}×</span>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:14 }}>
              {[
                { label:'Base Rate (FDA)', val:`${Math.round(baseProb*100)}%`, color:'var(--muted)' },
                { label:'+Sector +Desig', val:`${Math.round(Math.min(desigAdj,0.97)*100)}%`, color:'var(--warn)' },
                { label:'Science Adj.', val:`${Math.round(finalProb*100)}%`, color: finalProb>=0.5?'var(--success)':finalProb>=0.25?'var(--warn)':'var(--danger)' },
              ].map(item => (
                <div key={item.label} style={{ padding:10, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, textAlign:'center' }}>
                  <div style={{ fontSize:10, color:'var(--muted)', fontFamily:'var(--font-mono)', marginBottom:4 }}>{item.label}</div>
                  <div style={{ fontFamily:'var(--font-mono)', fontSize:18, fontWeight:600, color:item.color }}>{item.val}</div>
                </div>
              ))}
            </div>

            {/* Risk flags */}
            <div style={{ padding:12, background:'var(--bg)', borderRadius:8, border:'1px solid var(--border)' }}>
              <div style={{ fontSize:10, color:'var(--muted)', fontFamily:'var(--font-mono)', marginBottom:8, letterSpacing:.5 }}>KEY RISK FACTORS</div>
              {SCIENCE_DIMS.filter(d => (scores[d.id]??3) <= 2).length === 0
                ? <div style={{ fontSize:12, color:'var(--success)' }}>No critical risk flags. All dimensions rated 3+.</div>
                : SCIENCE_DIMS.filter(d => (scores[d.id]??3) <= 2).map(d => (
                  <div key={d.id} style={{ display:'flex', gap:8, marginBottom:6 }}>
                    <span style={{ color:'var(--danger)' }}>⚠</span>
                    <div>
                      <div style={{ fontSize:12, fontWeight:500 }}>{d.label}</div>
                      <div style={{ fontSize:11, color:'var(--muted)' }}>{d.levels[(scores[d.id]??3)-1]}</div>
                    </div>
                  </div>
                ))
              }
            </div>
          </div>

          <div style={{ marginTop:16 }}>
            <div className={styles.sectionTitle}>Science Radar</div>
            <div style={{ position:'relative', height:240 }}>
              <canvas ref={radarRef}/>
            </div>
          </div>
        </div>
      </div>

      {/* FDA Comps */}
      <div style={{ marginTop:24 }}>
        <div className={styles.sectionTitle}>
          FDA Historical Comps — {c.sector.charAt(0).toUpperCase()+c.sector.slice(1)}
          <span className={styles.badge} style={{ background:'rgba(77,110,245,0.2)', color:'var(--accent2)' }}>{comps.length} precedents</span>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table className={styles.compTable}>
            <thead><tr><th>Drug</th><th>Company</th><th>Indication</th><th>Mechanism</th><th>Endpoint</th><th>Year</th><th>Outcome</th><th>Note</th></tr></thead>
            <tbody>
              {comps.map((comp: any, i: number) => (
                <tr key={i}>
                  <td style={{ fontWeight:500 }}>{comp.drug}</td>
                  <td style={{ color:'var(--muted)' }}>{comp.company}</td>
                  <td style={{ fontSize:12 }}>{comp.indication}</td>
                  <td style={{ fontSize:11, color:'var(--muted)' }}>{comp.mechanism}</td>
                  <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{comp.endpoint}</td>
                  <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{comp.year}</td>
                  <td><span style={{ fontSize:10, padding:'2px 8px', borderRadius:4, background: comp.outcome==='approved'?'rgba(46,204,113,0.15)':'rgba(232,69,74,0.15)', color: comp.outcome==='approved'?'var(--success)':'var(--danger)', fontFamily:'var(--font-mono)' }}>{comp.outcome}</span></td>
                  <td style={{ fontSize:11, color:'var(--muted)', maxWidth:180 }}>{comp.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* CRL Patterns */}
      <div style={{ marginTop:24 }}>
        <div className={styles.sectionTitle}>
          CRL Risk — {c.sector.charAt(0).toUpperCase()+c.sector.slice(1)}
          <span className={styles.badge} style={{ background:'rgba(232,69,74,0.2)', color:'var(--danger)' }}>CRL Patterns</span>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:10 }}>
          {crls.map((crl: any, i: number) => (
            <div key={i} style={{ padding:12, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8 }}>
              <div style={{ fontSize:12, fontWeight:500, marginBottom:3 }}>{crl.reason}</div>
              <div style={{ fontSize:11, color:'var(--warn)', fontFamily:'var(--font-mono)', marginBottom:5 }}>Freq: {crl.freq}</div>
              <div style={{ fontSize:11, color:'var(--muted)', lineHeight:1.55 }}>{crl.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
