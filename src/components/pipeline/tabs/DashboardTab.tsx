'use client';

import { useMemo, useState } from 'react';
import { calcCompanyScore, FDA_PROBS } from '@/lib/constants';
import styles from './DashboardTab.module.css';

interface Catalyst {
  type?: string;        // 'pdufa' | 'data' | 'conference' | 'enrollment' | 'nda'
  label?: string;       // e.g. "PDUFA Date", "Ph2 ORR Data"
  date?: string;        // "Q2 2026" / "Q4 2026" / ISO
}

interface Drug {
  drug?: string;
  indication?: string;
  phase?: string;
  designations?: string[];
  catalysts?: Catalyst[];
}

interface Company {
  ticker: string;
  name: string;
  sector: string;
  mktCap?: number;
  cash?: number;
  burnRate?: number;
  pipeline?: Drug[];
  entryTarget?: number;
}

interface Price {
  price?: number;
  change?: number;
}

interface Props {
  companies: Company[];
  prices: Record<string, Price>;
  favorites: string[];
  scienceScores: Record<string, Record<string, number>>;
  onSelect: (ticker: string) => void;
  onToggleFav: (ticker: string) => void;
  onQuickAdd: () => void;
}

type SortKey = 'ticker' | 'next_catalyst' | 'pipeline_score' | 'mktCap' | 'runway' | 'change';
type SortDir = 'asc' | 'desc';

// ============================================================
// Helpers
// ============================================================
function leadDrug(c: Company): Drug | null {
  // "Lead" = highest phase, then most catalysts as tiebreak
  if (!c.pipeline || c.pipeline.length === 0) return null;
  const phaseOrder = ['Approved', 'NDA/BLA', 'Phase 3', 'Phase 2', 'Phase 1', 'Preclinical'];
  return [...c.pipeline].sort((a, b) => {
    const ai = phaseOrder.indexOf(a.phase ?? '');
    const bi = phaseOrder.indexOf(b.phase ?? '');
    if (ai !== bi) return ai - bi;
    return (b.catalysts?.length ?? 0) - (a.catalysts?.length ?? 0);
  })[0];
}

// Pull all catalysts from all drugs, return earliest upcoming
function nextCatalyst(c: Company): { catalyst: Catalyst; drug: string; daysOut: number | null; sortDate: string } | null {
  const all: { catalyst: Catalyst; drug: string }[] = (c.pipeline ?? []).flatMap(d =>
    (d.catalysts ?? []).map(cat => ({ catalyst: cat, drug: d.drug ?? '' }))
  );
  if (all.length === 0) return null;

  const parsed = all
    .map(x => ({ ...x, ...parseDate(x.catalyst.date) }))
    .filter(p => p.sortDate !== null)
    .sort((a, b) => (a.sortDate as string).localeCompare(b.sortDate as string));

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = parsed.find(p => (p.sortDate as string) >= today);
  const pick = upcoming ?? parsed[0];
  if (!pick) return null;

  return {
    catalyst: pick.catalyst,
    drug: pick.drug,
    daysOut: pick.daysOut,
    sortDate: pick.sortDate as string,
  };
}

function parseDate(input?: string): { sortDate: string | null; daysOut: number | null } {
  if (!input) return { sortDate: null, daysOut: null };
  const s = input.trim();

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    if (isNaN(d.getTime())) return { sortDate: null, daysOut: null };
    return { sortDate: s.slice(0, 10), daysOut: daysBetween(d) };
  }

  const qm = s.match(/Q([1-4])\s*(\d{2,4})/i);
  if (qm) {
    const q = parseInt(qm[1]);
    const yr = qm[2].length === 2 ? 2000 + parseInt(qm[2]) : parseInt(qm[2]);
    const month = (q - 1) * 3 + 2;
    const d = new Date(Date.UTC(yr, month - 1, 15));
    return { sortDate: d.toISOString().slice(0, 10), daysOut: daysBetween(d) };
  }

  const hm = s.match(/H([12])\s*(\d{2,4})/i);
  if (hm) {
    const h = parseInt(hm[1]);
    const yr = hm[2].length === 2 ? 2000 + parseInt(hm[2]) : parseInt(hm[2]);
    const month = h === 1 ? 3 : 9;
    const d = new Date(Date.UTC(yr, month - 1, 15));
    return { sortDate: d.toISOString().slice(0, 10), daysOut: daysBetween(d) };
  }

  const ym = s.match(/^(\d{4})$/);
  if (ym) {
    const d = new Date(Date.UTC(parseInt(ym[1]), 5, 15));
    return { sortDate: d.toISOString().slice(0, 10), daysOut: daysBetween(d) };
  }

  return { sortDate: null, daysOut: null };
}

function daysBetween(target: Date): number {
  const now = new Date();
  return Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatCatalystDate(catalyst: Catalyst): string {
  const raw = catalyst.date ?? '';
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const d = new Date(raw);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  return raw || 'TBD';
}

function runwayQuarters(c: Company): number | null {
  if (!c.cash || !c.burnRate || c.burnRate <= 0) return null;
  // burnRate is annual (B/yr), so quarters = (cash / burnRate) * 4
  return Math.round((c.cash / c.burnRate) * 4);
}

function fmtMcap(n?: number): string {
  if (n == null) return '—';
  if (n >= 1) return `$${n.toFixed(1)}B`;
  return `$${(n * 1000).toFixed(0)}M`;
}

// "Binary" = high-impact event types (PDUFA, Phase 3 data, NDA decision)
function isBinary(c: Catalyst): boolean {
  const t = (c.type ?? '').toLowerCase();
  return t === 'pdufa' || t === 'nda' || t === 'data';
}

// ============================================================
// Component
// ============================================================
export default function DashboardTab({
  companies, prices, favorites, scienceScores, onSelect, onToggleFav, onQuickAdd,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('next_catalyst');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [query, setQuery] = useState('');
  const [sectorFilter, setSectorFilter] = useState('all');
  const [favsOnly, setFavsOnly] = useState(false);

  const enriched = useMemo(() => {
    return companies.map(c => ({
      company: c,
      lead: leadDrug(c),
      pipelineScore: calcCompanyScore(c, scienceScores),
      next: nextCatalyst(c),
      runway: runwayQuarters(c),
      price: prices[c.ticker],
    }));
  }, [companies, prices, scienceScores]);

  const visible = useMemo(() => {
    let out = enriched;
    if (query) {
      const q = query.toLowerCase();
      out = out.filter(r => r.company.ticker.toLowerCase().includes(q) || r.company.name.toLowerCase().includes(q));
    }
    if (sectorFilter !== 'all') out = out.filter(r => r.company.sector === sectorFilter);
    if (favsOnly) out = out.filter(r => favorites.includes(r.company.ticker));

    const dir = sortDir === 'asc' ? 1 : -1;
    out = [...out].sort((a, b) => {
      switch (sortKey) {
        case 'ticker':
          return a.company.ticker.localeCompare(b.company.ticker) * dir;
        case 'next_catalyst': {
          const ad = a.next?.sortDate ?? '9999-12-31';
          const bd = b.next?.sortDate ?? '9999-12-31';
          return ad.localeCompare(bd) * dir;
        }
        case 'pipeline_score': {
          return ((a.pipelineScore ?? 0) - (b.pipelineScore ?? 0)) * dir;
        }
        case 'mktCap': {
          const av = a.company.mktCap ?? -Infinity;
          const bv = b.company.mktCap ?? -Infinity;
          return (av - bv) * dir;
        }
        case 'runway': {
          const av = a.runway ?? -Infinity;
          const bv = b.runway ?? -Infinity;
          return (av - bv) * dir;
        }
        case 'change': {
          const av = a.price?.change ?? -Infinity;
          const bv = b.price?.change ?? -Infinity;
          return (av - bv) * dir;
        }
      }
    });
    return out;
  }, [enriched, query, sectorFilter, favsOnly, favorites, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir(k === 'next_catalyst' || k === 'ticker' ? 'asc' : 'desc'); }
  };

  // Stats
  const stats = useMemo(() => {
    const within30 = enriched.filter(r => r.next?.daysOut != null && r.next.daysOut >= 0 && r.next.daysOut <= 30).length;
    const within90 = enriched.filter(r => r.next?.daysOut != null && r.next.daysOut >= 0 && r.next.daysOut <= 90).length;
    const binaries90 = enriched.filter(r => r.next && isBinary(r.next.catalyst) && r.next.daysOut != null && r.next.daysOut >= 0 && r.next.daysOut <= 90).length;
    const scored = enriched.filter(r => r.pipelineScore != null);
    const avgScore = scored.length === 0 ? 0 : Math.round(scored.reduce((a, b) => a + (b.pipelineScore ?? 0), 0) / scored.length);
    return { total: enriched.length, within30, within90, binaries90, avgScore };
  }, [enriched]);

  const sectors = useMemo(() => Array.from(new Set(companies.map(c => c.sector))), [companies]);

  return (
    <div className={styles.dashboard}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Watchlist Dashboard</h1>
          <p className={styles.subtitle}>
            {stats.total} names · {stats.within30} catalysts in 30d · {stats.within90} in 90d
          </p>
        </div>
        <button className={styles.addBtn} onClick={onQuickAdd}>+ Add Company</button>
      </div>

      <div className={styles.stats}>
        <StatCard label="Catalysts in 30 days" value={stats.within30.toString()} tone={stats.within30 > 0 ? 'warn' : 'neutral'} />
        <StatCard label="Catalysts in 90 days" value={stats.within90.toString()} tone="neutral" />
        <StatCard label="Binary events in 90d" value={stats.binaries90.toString()} tone={stats.binaries90 > 0 ? 'danger' : 'neutral'} />
        <StatCard label="Avg pipeline score" value={`${stats.avgScore}/100`} tone="success" />
      </div>

      <div className={styles.filters}>
        <input
          className={styles.search}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search ticker or name…"
        />
        <select className={styles.select} value={sectorFilter} onChange={e => setSectorFilter(e.target.value)}>
          <option value="all">All sectors</option>
          {sectors.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <label className={styles.checkLabel}>
          <input type="checkbox" checked={favsOnly} onChange={e => setFavsOnly(e.target.checked)} />
          Favorites only
        </label>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <Th onClick={() => toggleSort('ticker')} active={sortKey === 'ticker'} dir={sortDir}>Ticker</Th>
              <th>Lead Asset</th>
              <Th onClick={() => toggleSort('change')} active={sortKey === 'change'} dir={sortDir}>Price</Th>
              <Th onClick={() => toggleSort('next_catalyst')} active={sortKey === 'next_catalyst'} dir={sortDir}>Next Catalyst</Th>
              <th>Days</th>
              <Th onClick={() => toggleSort('pipeline_score')} active={sortKey === 'pipeline_score'} dir={sortDir}>Score</Th>
              <Th onClick={() => toggleSort('mktCap')} active={sortKey === 'mktCap'} dir={sortDir}>Mcap</Th>
              <Th onClick={() => toggleSort('runway')} active={sortKey === 'runway'} dir={sortDir}>Runway</Th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={8} className={styles.empty}>
                No companies match. <button className={styles.linkBtn} onClick={onQuickAdd}>Add one</button>
              </td></tr>
            )}
            {visible.map(({ company, lead, pipelineScore, next, runway, price }) => {
              const isFav = favorites.includes(company.ticker);
              const days = next?.daysOut;
              const urgency = days == null ? 'none' : days < 0 ? 'past' : days <= 30 ? 'hot' : days <= 90 ? 'warm' : 'cool';
              const binary = next ? isBinary(next.catalyst) : false;
              return (
                <tr key={company.ticker} className={styles.row} onClick={() => onSelect(company.ticker)}>
                  <td>
                    <div className={styles.tickerCell}>
                      <button
                        className={`${styles.starBtn} ${isFav ? styles.starOn : ''}`}
                        onClick={(e) => { e.stopPropagation(); onToggleFav(company.ticker); }}
                        title={isFav ? 'Unfavorite' : 'Favorite'}
                      >★</button>
                      <span className={styles.ticker}>{company.ticker}</span>
                    </div>
                    <div className={styles.companyName}>{company.name}</div>
                  </td>
                  <td>
                    {lead ? (
                      <>
                        <div className={styles.assetName}>{lead.drug || '—'}</div>
                        <div className={styles.assetMeta}>
                          {lead.phase && <span className={`${styles.phaseBadge} ${phaseClass(lead.phase)}`}>{lead.phase}</span>}
                          {lead.indication && <span className={styles.indication}>{lead.indication}</span>}
                        </div>
                      </>
                    ) : <span className={styles.dash}>—</span>}
                  </td>
                  <td>
                    {price?.price != null ? (
                      <>
                        <div className={styles.price}>${price.price.toFixed(2)}</div>
                        {price.change != null && (
                          <div className={`${styles.change} ${price.change >= 0 ? styles.up : styles.down}`}>
                            {price.change >= 0 ? '+' : ''}{price.change.toFixed(2)}%
                          </div>
                        )}
                      </>
                    ) : <span className={styles.dash}>—</span>}
                  </td>
                  <td>
                    {next ? (
                      <>
                        <div className={styles.catalystDesc}>
                          {binary && <span className={styles.binaryFlag}>⚡</span>}
                          {next.catalyst.label || next.catalyst.type || 'Event'}
                          {next.drug && <span className={styles.catalystDrug}> · {next.drug}</span>}
                        </div>
                        <div className={styles.catalystMeta}>
                          {next.catalyst.type && <span className={styles.eventType}>{next.catalyst.type.toUpperCase()}</span>}
                          {next.catalyst.type && ' · '}
                          {formatCatalystDate(next.catalyst)}
                        </div>
                      </>
                    ) : <span className={styles.dash}>—</span>}
                  </td>
                  <td>
                    {days != null && (
                      <span className={`${styles.daysBadge} ${styles[`urgency_${urgency}`]}`}>
                        {days < 0 ? `${Math.abs(days)}d ago` : `${days}d`}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`${styles.scoreCell} ${scoreClass(pipelineScore)}`}>
                      {pipelineScore != null ? pipelineScore : '—'}
                    </span>
                  </td>
                  <td className={styles.numCell}>{fmtMcap(company.mktCap)}</td>
                  <td className={styles.numCell}>{runway != null ? `${runway}q` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={styles.legend}>
        ★ favorite · ⚡ binary event (PDUFA / data readout / NDA) · click any row to open detail
      </div>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================
function Th({ children, onClick, active, dir }: { children: React.ReactNode; onClick: () => void; active: boolean; dir: SortDir }) {
  return (
    <th className={styles.sortableTh} onClick={onClick}>
      <span className={active ? styles.thActive : ''}>{children}</span>
      {active && <span className={styles.sortArrow}>{dir === 'asc' ? '▲' : '▼'}</span>}
    </th>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone: 'neutral' | 'warn' | 'danger' | 'success' }) {
  return (
    <div className={`${styles.statCard} ${styles[`tone_${tone}`]}`}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
    </div>
  );
}

function phaseClass(phase: string): string {
  const p = phase.toLowerCase();
  if (p.includes('preclinical')) return styles.phasePreclinical;
  if (p === 'phase 1') return styles.phase1;
  if (p === 'phase 2') return styles.phase2;
  if (p === 'phase 3') return styles.phase3;
  if (p.includes('nda') || p.includes('bla') || p.includes('filed')) return styles.phaseFiled;
  if (p.includes('approved')) return styles.phaseApproved;
  return styles.phasePreclinical;
}

// Pipeline score is 0–100. Match the color logic from the IOVA detail (orange ~57, etc.)
function scoreClass(score: number | null): string {
  if (score == null) return '';
  if (score >= 75) return styles.scoreHigh;
  if (score >= 50) return styles.scoreMid;
  return styles.scoreLow;
}