'use client';

import { useState } from 'react';
import { calcApprovalProb, CATALYST_IMPACT } from '@/lib/constants';
import styles from './Tabs.module.css';

const NOW = new Date(2026, 2, 28);
const TOTAL_MONTHS = 20;

function dateFromQ(q: string): Date | null {
  const m = q?.match(/Q(\d)\s+(\d{4})/);
  if (!m) return null;
  return new Date(parseInt(m[2]), (parseInt(m[1])-1)*3+1, 15);
}

function monthsFromNow(d: Date): number {
  return (d.getFullYear() - NOW.getFullYear())*12 + (d.getMonth() - NOW.getMonth());
}

const TYPE_COLORS: Record<string, string> = {
  pdufa: 'var(--gold)', data: 'var(--accent2)', enrollment: 'var(--accent)',
  conference: 'var(--purple)', nda: 'var(--warn)',
};
const TYPE_LABELS: Record<string, string> = {
  pdufa: 'PDUFA Date', data: 'Data Readout', enrollment: 'Enrollment Complete',
  conference: 'Conference', nda: 'NDA/BLA Submission',
};

function getDesigBadges(desig: string[]) {
  const map: Record<string,string> = { BT:'Breakthrough', FT:'Fast Track', AA:'Accel.', ODD:'Orphan', PR:'Priority Rev.' };
  const colors: Record<string,string> = {
    BT:'rgba(176,110,245,0.15)',FT:'rgba(0,229,180,0.15)',
    AA:'rgba(255,215,0,0.15)',ODD:'rgba(245,166,35,0.15)',PR:'rgba(232,69,74,0.15)'
  };
  const textColors: Record<string,string> = {
    BT:'var(--purple)',FT:'var(--accent)',AA:'var(--gold)',ODD:'var(--warn)',PR:'var(--danger)'
  };
  return (desig ?? []).map(d => (
    <span key={d} style={{ fontSize:10, padding:'2px 7px', borderRadius:4, background: colors[d]||'var(--border)', color: textColors[d]||'var(--muted)', fontFamily:'var(--font-mono)', marginRight:4 }}>
      {map[d]||d}
    </span>
  ));
}

export default function CatalystTab({ company, scienceScores }: { company: any; scienceScores: Record<string,any> }) {
  const [userProbs, setUserProbs] = useState<Record<string,number>>({});
  const c = company;

  const allCatalysts: any[] = [];
  c.pipeline.forEach((drug: any) => {
    (drug.catalysts ?? []).forEach((cat: any) => {
      const d = dateFromQ(cat.date);
      allCatalysts.push({ ...cat, drugName: drug.drug, indication: drug.indication, phase: drug.phase, drugObj: drug, dateParsed: d });
    });
  });
  allCatalysts.sort((a,b) => (a.dateParsed?.getTime()??9e15) - (b.dateParsed?.getTime()??9e15));

  const nowPct = (2/(TOTAL_MONTHS+2))*100;
  const monthLabels: { label: string; pct: number }[] = [];
  for (let i = 0; i <= TOTAL_MONTHS; i += 3) {
    const d = new Date(NOW.getFullYear(), NOW.getMonth()+i, 1);
    monthLabels.push({ label: d.toLocaleDateString('en-US',{month:'short',year:'2-digit'}), pct: (i/TOTAL_MONTHS)*100 });
  }

  const dots = allCatalysts.map(cat => {
    if (!cat.dateParsed) return null;
    const mfn = monthsFromNow(cat.dateParsed);
    if (mfn < -2 || mfn > TOTAL_MONTHS) return null;
    return { ...cat, pct: Math.max(2, Math.min(98, ((mfn+2)/(TOTAL_MONTHS+2))*100)) };
  }).filter(Boolean) as any[];

  const within3 = allCatalysts.filter(x => { const m = x.dateParsed ? monthsFromNow(x.dateParsed) : -1; return m >= 0 && m <= 3; }).length;

  return (
    <div>
      {/* Timeline */}
      <div style={{ position:'relative', height:58, marginBottom:20 }}>
        <div style={{ position:'absolute', top:22, left:0, right:0, height:4, background:'var(--border)', borderRadius:2 }}/>
        {/* Now line */}
        <div style={{ position:'absolute', left:`${nowPct}%`, top:6, bottom:0, width:2, background:'var(--accent)', borderRadius:1 }}>
          <span style={{ position:'absolute', top:-16, left:'50%', transform:'translateX(-50%)', fontFamily:'var(--font-mono)', fontSize:9, color:'var(--accent)', whiteSpace:'nowrap' }}>NOW</span>
        </div>
        {/* Month labels */}
        {monthLabels.map((m,i) => (
          <div key={i} style={{ position:'absolute', left:`${m.pct}%`, top:2, fontFamily:'var(--font-mono)', fontSize:9, color:'var(--muted)', transform:'translateX(-50%)' }}>{m.label}</div>
        ))}
        {/* Dots */}
        {dots.map((dot, i) => (
          <div key={i} style={{ position:'absolute', left:`${dot.pct}%`, top:24, width:13, height:13, borderRadius:'50%', background: TYPE_COLORS[dot.type]||'var(--accent2)', border:'2px solid var(--bg)', transform:'translate(-50%,-50%)', cursor:'pointer', zIndex:3 }} title={`${dot.drugName}: ${dot.label}`}/>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display:'flex', gap:14, flexWrap:'wrap', marginBottom:18 }}>
        {Object.entries(TYPE_LABELS).map(([k,v]) => (
          <span key={k} style={{ fontSize:10, color:'var(--muted)', display:'flex', alignItems:'center', gap:4 }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background: TYPE_COLORS[k], display:'inline-block' }}/>
            {v}
          </span>
        ))}
      </div>

      {/* Section title */}
      <div className={styles.sectionTitle}>
        Catalyst Cards
        <span className={styles.badge} style={{ background:'rgba(176,110,245,0.2)', color:'var(--purple)' }}>{allCatalysts.length} events</span>
        {within3 > 0 && <span className={styles.badge} style={{ background:'rgba(245,166,35,0.2)', color:'var(--warn)' }}>{within3} within 3mo</span>}
      </div>

      <div className={styles.catalystGrid}>
        {allCatalysts.map((cat, i) => {
          const key = `${cat.drugName}_${cat.type}`;
          const modelProb = calcApprovalProb(cat.drugObj, c.sector, scienceScores[c.ticker+'_'+cat.drugName] ?? cat.drugObj.science);
          const userProb = userProbs[key] !== undefined ? userProbs[key] : modelProb;
          const impKey = cat.type === 'pdufa' ? 'PDUFA' : cat.type === 'nda' ? 'NDA/BLA' : cat.type === 'conference' ? 'Conference' : cat.type === 'enrollment' ? 'Enrollment' : 'Phase 2';
          const imp = CATALYST_IMPACT[impKey] ?? CATALYST_IMPACT['Conference'];
          const up = Math.round(imp.posBase + (userProb-0.5)*20);
          const dn = Math.round(imp.negBase + (1-userProb)*20);
          const ev = (userProb*up - (1-userProb)*dn).toFixed(1);
          const evPos = parseFloat(ev) >= 0;
          const isPast = cat.dateParsed && cat.dateParsed < NOW;
          const mfn = cat.dateParsed ? monthsFromNow(cat.dateParsed) : null;
          const isUrgent = mfn !== null && mfn >= 0 && mfn <= 3;

          return (
            <div key={i} className={styles.catalystCard} style={{
              borderLeftColor: TYPE_COLORS[cat.type] || 'var(--border2)',
              opacity: isPast ? 0.5 : 1,
              border: isUrgent ? '1px solid rgba(245,166,35,0.4)' : undefined,
            }}>
              <div className={styles.catHeader}>
                <span className={styles.catDrug}>{cat.drugName}{isPast && <span style={{fontSize:10,color:'var(--muted)',marginLeft:5}}>(past)</span>}</span>
                <span className={styles.catDate}>{cat.date}</span>
              </div>
              <div style={{ fontSize:10, padding:'2px 7px', borderRadius:4, background:`${TYPE_COLORS[cat.type]}22`, color: TYPE_COLORS[cat.type], fontFamily:'var(--font-mono)', display:'inline-block', marginBottom:6 }}>{TYPE_LABELS[cat.type]||cat.type}</div>
              <div className={styles.catIndication}>{cat.indication}</div>
              <div style={{ marginBottom:8 }}>{getDesigBadges(cat.drugObj.designations)}</div>

              {/* Probabilities */}
              <div className={styles.probRows}>
                <div className={styles.probRow}>
                  <span>Science-adj. PoS</span>
                  <span style={{ fontFamily:'var(--font-mono)', color: modelProb>=0.5?'var(--success)':modelProb>=0.25?'var(--warn)':'var(--danger)' }}>{Math.round(modelProb*100)}%</span>
                </div>
                <div className={styles.probRow}>
                  <span>Your estimate</span>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <input type="range" min={1} max={97} step={1} value={Math.round(userProb*100)}
                      onChange={e => setUserProbs(p => ({...p, [key]: parseInt(e.target.value)/100}))}
                      style={{ width:80 }}
                    />
                    <span style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--accent)', minWidth:32 }}>{Math.round(userProb*100)}%</span>
                  </div>
                </div>
              </div>

              {/* EV bar */}
              <div style={{ marginTop:10, paddingTop:10, borderTop:'1px solid var(--border)' }}>
                <div className={styles.probRow} style={{ marginBottom:8 }}>
                  <span>Expected move (EV)</span>
                  <span style={{ fontFamily:'var(--font-mono)', fontWeight:600, fontSize:13, color: evPos?'var(--success)':'var(--danger)' }}>{evPos?'+':''}{ev}%</span>
                </div>
                <div style={{ height:20, borderRadius:4, background:'var(--surface2)', position:'relative', overflow:'hidden' }}>
                  <div style={{ position:'absolute', left:'50%', top:0, height:'100%', width:1, background:'var(--border2)' }}/>
                  <div style={{ position:'absolute', left:'50%', top:0, height:'100%', width:`${Math.min(up/100*50,49)}%`, background:'var(--success)', borderRadius:'0 4px 4px 0' }}/>
                  <div style={{ position:'absolute', right:'50%', top:0, height:'100%', width:`${Math.min(dn/100*50,49)}%`, background:'var(--danger)', borderRadius:'4px 0 0 4px' }}/>
                  <span style={{ position:'absolute', left:4, top:'50%', transform:'translateY(-50%)', fontFamily:'var(--font-mono)', fontSize:10, color:'var(--danger)', fontWeight:500 }}>−{dn}%</span>
                  <span style={{ position:'absolute', right:4, top:'50%', transform:'translateY(-50%)', fontFamily:'var(--font-mono)', fontSize:10, color:'var(--success)', fontWeight:500 }}>+{up}%</span>
                </div>
              </div>

              {/* Trade setup */}
              <div style={{ marginTop:10, padding:10, background:'rgba(0,229,180,0.04)', border:'1px solid rgba(0,229,180,0.1)', borderRadius:6, fontSize:11, color:'var(--muted)', lineHeight:1.75 }}>
                <div style={{ color:'var(--accent)', fontFamily:'var(--font-mono)', fontSize:10, marginBottom:4, letterSpacing:.5 }}>TRADE SETUP</div>
                <b style={{ color:'var(--text)' }}>Strategy:</b> {userProb>0.6?'Long equity + OTM covered call':userProb>0.4?'Long equity or ATM calls, size down':'Speculative OTM calls only, small size'}<br/>
                <b style={{ color:'var(--text)' }}>Sizing:</b> {userProb>0.6?'Normal (1–2%)':userProb>0.4?'Reduced (0.5–1%)':'Speculative (0.25%)'}<br/>
                <b style={{ color:'var(--text)' }}>Entry:</b> {cat.dateParsed?`4–6 wks before ${cat.date}, exit on event day`:'4–6 wks before catalyst'}<br/>
                <b style={{ color:'var(--text)' }}>Watch:</b> FDA Ad-Com, competitor readouts, enrollment updates
              </div>
            </div>
          );
        })}
        {allCatalysts.length === 0 && (
          <div style={{ fontSize:13, color:'var(--muted)', padding:'24px 0' }}>No catalysts defined for this company yet.</div>
        )}
      </div>
    </div>
  );
}
