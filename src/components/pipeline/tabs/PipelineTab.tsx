'use client';

import { useEffect, useRef } from 'react';
import { calcApprovalProb, SECTOR_MOD } from '@/lib/constants';
import styles from './Tabs.module.css';
import { Chart, BarController, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js';
Chart.register(BarController, CategoryScale, LinearScale, BarElement, Tooltip, Legend);

// ── Shared helpers ────────────────────────────────────────────────────────────
function phaseBadge(phase: string) {
  const map: Record<string,{bg:string,color:string}> = {
    'Phase 1':   {bg:'rgba(77,110,245,0.15)',  color:'#7a9af5'},
    'Phase 2':   {bg:'rgba(245,166,35,0.15)',  color:'var(--warn)'},
    'Phase 3':   {bg:'rgba(0,229,180,0.15)',   color:'var(--accent)'},
    'NDA/BLA':   {bg:'rgba(255,215,0,0.15)',   color:'var(--gold)'},
    'Approved':  {bg:'rgba(46,204,113,0.15)',  color:'var(--success)'},
  };
  const s = map[phase] ?? map['Phase 1'];
  return <span style={{ display:'inline-block', padding:'3px 9px', borderRadius:4, fontFamily:'var(--font-mono)', fontSize:11, fontWeight:500, background:s.bg, color:s.color }}>{phase}</span>;
}

function desigBadges(desig: string[]) {
  const map: Record<string,{bg:string,color:string}> = {
    BT:  {bg:'rgba(176,110,245,0.15)', color:'var(--purple)'},
    FT:  {bg:'rgba(0,229,180,0.15)',   color:'var(--accent)'},
    ODD: {bg:'rgba(245,166,35,0.15)',  color:'var(--warn)'},
    AA:  {bg:'rgba(255,215,0,0.15)',   color:'var(--gold)'},
    PR:  {bg:'rgba(232,69,74,0.15)',   color:'var(--danger)'},
  };
  const labels: Record<string,string> = {BT:'Breakthrough',FT:'Fast Track',ODD:'Orphan',AA:'Accel.',PR:'Priority'};
  return (desig??[]).map(d => {
    const s = map[d] ?? {bg:'var(--border)',color:'var(--muted)'};
    return <span key={d} style={{ fontSize:10, padding:'2px 6px', borderRadius:4, fontFamily:'var(--font-mono)', background:s.bg, color:s.color, marginRight:4 }}>{labels[d]||d}</span>;
  });
}

function ProbBar({ prob }: { prob: number }) {
  const color = prob >= 0.5 ? 'var(--success)' : prob >= 0.25 ? 'var(--warn)' : 'var(--danger)';
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      <div style={{ flex:1, height:5, borderRadius:3, background:'var(--border2)', overflow:'hidden', minWidth:55 }}>
        <div style={{ height:'100%', width:`${Math.round(prob*100)}%`, background:color, borderRadius:3 }}/>
      </div>
      <span style={{ fontFamily:'var(--font-mono)', fontSize:12, color, minWidth:34, textAlign:'right' }}>{Math.round(prob*100)}%</span>
    </div>
  );
}

// ── PIPELINE TAB ──────────────────────────────────────────────────────────────
export function PipelineTab({ company, scienceScores }: { company: any; scienceScores: Record<string,any> }) {
  const c = company;
  const barRef = useRef<HTMLCanvasElement>(null);
  const transRef = useRef<HTMLCanvasElement>(null);
  const barChart = useRef<Chart|null>(null);
  const transChart = useRef<Chart|null>(null);

  useEffect(() => {
    if (!barRef.current) return;
    if (barChart.current) { barChart.current.destroy(); barChart.current = null; }
    const data = c.pipeline.map((d: any) => {
      const key = c.ticker+'_'+d.drug;
      return Math.round(calcApprovalProb(d, c.sector, scienceScores[key]??d.science)*100);
    });
    barChart.current = new Chart(barRef.current, {
      type: 'bar',
      data: { labels: c.pipeline.map((d: any) => d.drug), datasets: [{ data, backgroundColor: data.map((v: number) => v>=50?'#2ecc71':v>=25?'#f5a623':'#e8454a'), borderRadius: 4, borderSkipped: false }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales: { y:{min:0,max:100,grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#7a8099',callback:(v:any)=>v+'%',font:{size:11}}}, x:{grid:{display:false},ticks:{color:'#7a8099',font:{size:10}}} } },
    });
  }, [c.ticker, JSON.stringify(scienceScores)]);

  useEffect(() => {
    if (!transRef.current) return;
    if (transChart.current) { transChart.current.destroy(); transChart.current = null; }
    const mod = SECTOR_MOD[c.sector] ?? 1.0;
    const base = [52.7, 28.5, 57.8, 87.5];
    transChart.current = new Chart(transRef.current, {
      type: 'bar',
      data: { labels: ['Ph1→2','Ph2→3','Ph3→NDA','NDA→Appvl'], datasets: [
        { label: 'Industry avg', data: base, backgroundColor: 'rgba(122,128,153,0.3)', borderRadius: 4 },
        { label: c.sector+' adj.', data: base.map((r: number) => Math.min(r*mod,100)), backgroundColor: 'rgba(77,110,245,0.7)', borderRadius: 4 },
      ]},
      options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:true,labels:{color:'#7a8099',font:{size:10},boxWidth:10}}}, scales: { y:{min:0,max:100,grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#7a8099',callback:(v:any)=>v+'%',font:{size:10}}}, x:{grid:{display:false},ticks:{color:'#7a8099',font:{size:10}}} } },
    });
  }, [c.ticker]);

  return (
    <div>
      <div className={styles.sectionTitle}>Pipeline Assets <span className={styles.badge} style={{background:'rgba(0,200,212,0.2)',color:'var(--teal)'}}>Science-Adjusted</span></div>
      <div style={{ overflowX:'auto' }}>
        <table className={styles.pipelineTable}>
          <thead><tr><th>Drug</th><th>Indication</th><th>Phase</th><th>Enrollment</th><th>Endpoint</th><th>Readout</th><th>Approval Prob.</th></tr></thead>
          <tbody>
            {c.pipeline.map((drug: any, i: number) => {
              const key = c.ticker+'_'+drug.drug;
              const prob = calcApprovalProb(drug, c.sector, scienceScores[key]??drug.science);
              return (
                <tr key={i}>
                  <td><span style={{fontWeight:500}}>{drug.drug}</span><div style={{marginTop:3}}>{desigBadges(drug.designations)}</div></td>
                  <td style={{color:'var(--muted)',fontSize:12}}>{drug.indication}</td>
                  <td>{phaseBadge(drug.phase)}</td>
                  <td style={{fontFamily:'var(--font-mono)',fontSize:12}}>{(drug.enrollment??0).toLocaleString()}</td>
                  <td style={{fontSize:12,color:'var(--muted)'}}>{drug.primaryEndpoint}</td>
                  <td style={{fontFamily:'var(--font-mono)',fontSize:12,color:'var(--accent2)'}}>{drug.data}</td>
                  <td style={{minWidth:130}}><ProbBar prob={prob}/></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className={styles.chartsGrid}>
        <div className={styles.chartCard}><div className={styles.chartTitle}>Approval probability by asset</div><div style={{position:'relative',height:220}}><canvas ref={barRef}/></div></div>
        <div className={styles.chartCard}><div className={styles.chartTitle}>Phase transition rates — {c.sector} vs industry</div><div style={{position:'relative',height:220}}><canvas ref={transRef}/></div></div>
      </div>
    </div>
  );
}

// ── MONTE CARLO TAB ───────────────────────────────────────────────────────────
export function MonteCarloTab({ company, scienceScores }: { company: any; scienceScores: Record<string,any> }) {
  const c = company;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mcChart = useRef<Chart|null>(null);
  const [trials, setTrials] = React.useState(10000);
  const [corr, setCorr] = React.useState('none');
  const [horizon, setHorizon] = React.useState(5);
  const [stats, setStats] = React.useState<{mean:string,p10:number,p90:number,pZero:string}|null>(null);

  function runMC() {
    const results: number[] = [];
    for (let i = 0; i < trials; i++) {
      let approvals = 0;
      const cf = corr==='high'?(Math.random()<0.3?0.3:1.0):corr==='low'?(0.8+Math.random()*0.4):1.0;
      c.pipeline.forEach((drug: any) => {
        const key = c.ticker+'_'+drug.drug;
        const prob = calcApprovalProb(drug, c.sector, scienceScores[key]??drug.science) * cf;
        const ya = drug.phase==='Approved'?1.0:Math.min(1.0,horizon/5);
        if (Math.random() < prob*ya) approvals++;
      });
      results.push(approvals);
    }
    const max = Math.max(...results);
    const buckets = Array(max+1).fill(0);
    results.forEach(r => buckets[r]++);
    const probs = buckets.map(b => parseFloat(((b/trials)*100).toFixed(1)));
    const sorted = [...results].sort((a,b)=>a-b);
    setStats({
      mean: (results.reduce((a,b)=>a+b,0)/trials).toFixed(2),
      p10: sorted[Math.floor(trials*0.1)],
      p90: sorted[Math.floor(trials*0.9)],
      pZero: ((results.filter(r=>r===0).length/trials)*100).toFixed(1),
    });
    if (!canvasRef.current) return;
    if (mcChart.current) { mcChart.current.destroy(); mcChart.current = null; }
    mcChart.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: { labels: buckets.map((_,i)=>i===1?'1 approval':`${i} approvals`), datasets:[{data:probs,backgroundColor:buckets.map((_,i)=>i===0?'#e8454a':i===1?'#f5a623':'#2ecc71'),borderRadius:4,borderSkipped:false}] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false},tooltip:{callbacks:{label:(ctx:any)=>ctx.parsed.y.toFixed(1)+'% of trials'}}}, scales:{y:{grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#7a8099',callback:(v:any)=>v+'%',font:{size:11}}},x:{grid:{display:false},ticks:{color:'#7a8099',font:{size:11}}}} },
    });
  }

  useEffect(() => { runMC(); }, []);

  return (
    <div>
      <div className={styles.sectionTitle}>Monte Carlo Simulation <span className={styles.badge} style={{background:'rgba(77,110,245,0.2)',color:'var(--accent2)'}}>Science-Adjusted</span></div>
      <div style={{ display:'flex', gap:14, marginBottom:14, flexWrap:'wrap', alignItems:'flex-end' }}>
        {[
          { label:'Trials', el: <><input type="range" min={1000} max={50000} step={1000} value={trials} onChange={e=>setTrials(parseInt(e.target.value))} style={{width:130}}/><span style={{fontFamily:'var(--font-mono)',fontSize:12,color:'var(--accent)',marginLeft:6}}>{trials.toLocaleString()}</span></> },
          { label:'Correlation', el: <select value={corr} onChange={e=>setCorr(e.target.value)} style={{background:'var(--surface)',border:'1px solid var(--border2)',color:'var(--text)',padding:'5px 9px',borderRadius:6,fontSize:12}}><option value="none">None</option><option value="low">Low (sector)</option><option value="high">High (platform)</option></select> },
          { label:'Horizon', el: <select value={horizon} onChange={e=>setHorizon(parseInt(e.target.value))} style={{background:'var(--surface)',border:'1px solid var(--border2)',color:'var(--text)',padding:'5px 9px',borderRadius:6,fontSize:12}}><option value={3}>3yr</option><option value={5}>5yr</option><option value={10}>10yr</option></select> },
        ].map(item => (
          <div key={item.label}><div style={{fontSize:11,color:'var(--muted)',marginBottom:3}}>{item.label}</div>{item.el}</div>
        ))}
        <button onClick={runMC} style={{padding:'7px 16px',background:'var(--accent)',color:'#000',border:'none',borderRadius:6,fontWeight:600,fontSize:12,cursor:'pointer'}}>Run ▶</button>
      </div>
      <div style={{position:'relative',height:230}}><canvas ref={canvasRef}/></div>
      {stats && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginTop:12 }}>
          {[
            { label:'Expected Approvals', val:stats.mean, color:'var(--accent)' },
            { label:'10th–90th Pctile', val:`${stats.p10}–${stats.p90}`, color:'var(--accent2)' },
            { label:'Zero Approval Risk', val:`${stats.pZero}%`, color: parseFloat(stats.pZero)>30?'var(--danger)':parseFloat(stats.pZero)>10?'var(--warn)':'var(--success)' },
          ].map(item => (
            <div key={item.label} style={{ padding:11, borderRadius:8, border:'1px solid var(--border)', background:'var(--surface2)', textAlign:'center' }}>
              <div style={{fontSize:10,color:'var(--muted)',marginBottom:4}}>{item.label}</div>
              <div style={{fontFamily:'var(--font-mono)',fontSize:16,fontWeight:500,color:item.color}}>{item.val}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── VALUATION TAB ─────────────────────────────────────────────────────────────
export function ValuationTab({ company, scienceScores, livePrice, onSaveNotes, notes }: { company: any; scienceScores: Record<string,any>; livePrice: number; onSaveNotes: (t:string,th:string,r:string)=>void; notes?: any }) {
  const c = company;
  const [thesis, setThesis] = React.useState(notes?.thesis ?? c.thesis ?? '');
  const [risks, setRisks] = React.useState(notes?.risks ?? c.risks ?? '');
  const [saved, setSaved] = React.useState(false);

  const totalRNPV = c.pipeline.reduce((sum: number, drug: any) => {
    const key = c.ticker+'_'+drug.drug;
    return sum + calcApprovalProb(drug, c.sector, scienceScores[key]??drug.science) * drug.peakSales * 3.0 * 0.32;
  }, 0);
  const premium = ((totalRNPV - c.mktCap) / c.mktCap * 100).toFixed(0);

  function save() {
    onSaveNotes(c.ticker, thesis, risks);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div>
      <div className={styles.sectionTitle}>Risk-Adjusted NPV <span className={styles.badge} style={{background:'rgba(0,200,212,0.2)',color:'var(--teal)'}}>Science-Adjusted PoS</span></div>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:16, marginBottom:16 }}>
        {c.pipeline.map((drug: any, i: number) => {
          const key = c.ticker+'_'+drug.drug;
          const prob = calcApprovalProb(drug, c.sector, scienceScores[key]??drug.science);
          const rNPV = (prob * drug.peakSales * 3.0 * 0.32).toFixed(2);
          const color = prob>=0.5?'var(--success)':prob>=0.25?'var(--warn)':'var(--danger)';
          return (
            <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'7px 0', borderBottom:'1px solid var(--border)', fontSize:13, flexWrap:'wrap', gap:8 }}>
              <span style={{ color:'var(--muted)' }}>{drug.drug} — {drug.indication.split(' ')[0]}</span>
              <span style={{ display:'flex', gap:12, alignItems:'center' }}>
                <span style={{ fontSize:12, color:'var(--muted)' }}>Peak ${drug.peakSales}B · PoS <span style={{color}}>{Math.round(prob*100)}%</span></span>
                <span style={{ fontFamily:'var(--font-mono)', fontWeight:500, color:'var(--accent)' }}>rNPV ${rNPV}B</span>
              </span>
            </div>
          );
        })}
        {[
          { label:'Total Pipeline rNPV', val:`~$${totalRNPV.toFixed(1)}B`, color:'var(--accent)', size:14 },
          { label:'Market Cap', val:`$${c.mktCap}B`, color:'var(--text)', size:13 },
          { label:'Pipeline Premium/Discount', val:`${parseFloat(premium)>0?'+':''}${premium}%`, color:parseFloat(premium)>0?'var(--success)':'var(--danger)', size:13 },
          { label:'Cash', val:`$${c.cash}B`, color:'var(--text)', size:13 },
          { label:'Burn Rate', val:`-$${c.burnRate}B/yr`, color:'var(--warn)', size:13 },
          { label:'Intrinsic Est.', val:`~$${(totalRNPV+c.cash).toFixed(1)}B`, color:'var(--accent)', size:14 },
        ].map((row, i) => (
          <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:`${i===0?'10px':'7px'} 0`, borderBottom: i<5?'1px solid var(--border)':'none', borderTop: i===0?'1px solid var(--border2)':'none', marginTop: i===0?4:0, fontSize:13 }}>
            <span style={{ color: i===0||i===5?'var(--text)':'var(--muted)', fontWeight: i===0||i===5?500:400 }}>{row.label}</span>
            <span style={{ fontFamily:'var(--font-mono)', fontWeight:500, color:row.color, fontSize:row.size }}>{row.val}</span>
          </div>
        ))}
      </div>

      {/* Notes editor */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:16 }}>
        <div className={styles.sectionTitle} style={{ marginBottom:12 }}>Investment Notes</div>
        <div style={{ marginBottom:12 }}>
          <label style={{ fontSize:10, color:'var(--muted)', fontFamily:'var(--font-mono)', letterSpacing:.5, display:'block', marginBottom:4 }}>THESIS</label>
          <textarea value={thesis} onChange={e=>setThesis(e.target.value)} rows={3} placeholder="Why are you looking at this name?" style={{ width:'100%', background:'var(--bg)', border:'1px solid var(--border2)', color:'var(--text)', padding:'8px 10px', borderRadius:6, fontSize:12, resize:'vertical', lineHeight:1.6 }}/>
        </div>
        <div style={{ marginBottom:12 }}>
          <label style={{ fontSize:10, color:'var(--muted)', fontFamily:'var(--font-mono)', letterSpacing:.5, display:'block', marginBottom:4 }}>KEY RISKS</label>
          <textarea value={risks} onChange={e=>setRisks(e.target.value)} rows={2} placeholder="Competing drug, cash runway concerns, CMC..." style={{ width:'100%', background:'var(--bg)', border:'1px solid var(--border2)', color:'var(--text)', padding:'8px 10px', borderRadius:6, fontSize:12, resize:'vertical', lineHeight:1.6 }}/>
        </div>
        <button onClick={save} style={{ padding:'8px 18px', background: saved?'var(--success)':'var(--accent)', color:'#000', border:'none', borderRadius:6, fontWeight:600, fontSize:12, cursor:'pointer', transition:'background .2s' }}>
          {saved ? '✓ Saved' : 'Save Notes'}
        </button>
      </div>

      <div style={{ marginTop:12, padding:12, background:'var(--surface2)', borderRadius:8, border:'1px solid var(--border)', fontSize:11, color:'var(--muted)', lineHeight:1.8 }}>
        <b style={{color:'var(--text)'}}>Model:</b> rNPV = Science-Adjusted PoS × Peak Sales × 3.0× revenue multiple × 0.32 discount. Science scorer adjusts FDA base rates across 6 dimensions. Not financial advice.
      </div>
    </div>
  );
}

// Need React for hooks in this file
import React from 'react';