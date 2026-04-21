'use client';

import { useMemo, useState } from 'react';
import styles from './DashboardTab.module.css';

interface Catalyst {
  date?: string;        // ISO date string OR "Q4 2026" / "H1 2026"
  type?: string;        // 'data', 'pdufa', 'earnings', etc
  description?: string;
  drug?: string;
  binary?: boolean;
}

interface Drug {
  drug?: string;
  drugName?: string;     // tolerate either key
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

type SortKey = 'ticker' | 'next_catalyst' | 'science' | 'mktCap' | 'runway' | 'change';
type SortDir = 'asc' | 'desc';

// ============================================================
// Helpers — read from existing pipeline JSONB shape
// ============================================================
function leadDrug(c: Company): Drug | null {
  return c.pipeline?.[0] ?? null;
}

function drugName(d: Drug): string {
  return d.drug ?? d.drugName ?? '';
}

// Average science score across all dimensions for the lead drug
function leadScienceScore(c: Company, scoreMap: Record<string, Record<string, number>>): number | null {
  const lead = leadDrug(c);
  if (!lead) return null;
  const key = `${c.ticker}_${drugName(lead)}`;
  const scores = scoreMap[key];
  if (!scores || Object.keys(scores).length === 0) return null;
  const vals = Object.values(scores);
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

// Pull all catalysts from all drugs in pipeline, return earliest upcoming
function nextCatalyst(c: Company): { catalyst: Catalyst; daysOut: number | null; sortDate: string } | null {
  const all: Catalyst[] = (c.pipeline ?? []).flatMap(d => d.catalysts ?? []);
  if (all.length === 0) return null;

  const parsed = all
    .map(cat => ({ catalyst: cat, ...parseDate(cat.date) }))
    .filter(p => p.sortDate !== null)
    .sort((a, b) => (a.sortDate as string).localeCompare(b.sortDate as string));

  // Prefer first upcoming (>= today), else most recent past
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = parsed.find(p => (p.sortDate as string) >= today);
  const pick = upcoming ?? parsed[0];
  if (!pick) return null;

  return {
    catalyst: pick.catalyst,
    daysOut: pick.daysOut,
    sortDate: pick.sortDate as string,
  };
}

// Parse "2026-04-21" or "Q4 2026" or "H1 2026" into a sortable date + days-out
function parseDate(input?: string): { sortDate: string | null; daysOut: number | null } {
  if (!input) return { sortDate: null, daysOut: null };
  const s = input.trim();

  // ISO date
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    if (isNaN(d.getTime())) return { sortDate: null, daysOut: null };
    return { sortDate: s.slice(0, 10), daysOut: daysBetween(d) };
  }

  // Quarter "Q4 2026" / "Q4 26"
  const qm = s.match(/Q([1-4])\s*(\d{2,4})/i);
  if (qm) {
    const q = parseInt(qm[1]);
    const yr = qm[2].length === 2 ? 2000 + parseInt(qm[2]) : parseInt(qm[2]);
    const month = (q - 1) * 3 + 2; // mid-quarter
    const d = new Date(Date.UTC(yr, month - 1, 15));
    return { sortDate: d.toISOString().slice(0, 10), daysOut: daysBetween(d) };
  }

  // Half "H1 2026" / "H2 2026"
  const hm = s.match(/H([12])\s*(\d{2,4})/i);
  if (hm) {
    const h = parseInt(hm[1]);
    const yr = hm[2].length === 2 ? 2000 + parseInt(hm[2]) : parseInt(hm[2]);
    const month = h === 1 ? 3 : 9;
    const d = new Date(Date.UTC(yr, month - 1, 15));
    return { sortDate: d.toISOString().slice(0, 10), daysOut: daysBetween(d) };
  }

  // Year only
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
  // If ISO, prettify
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const d = new Date(raw);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  return raw || 'TBD';
}

function runwayQuarters(c: Company): number | null {
  if (!c.cash || !c.burnRate || c.burnRate <= 0) return null;
  return Math.floor(c.cash / c.burnRate);
}

function fmtMcap(n?: number): string {
  if (n == null) return '—';
  if (n >= 1) return `$${n.toFixed(1)}B`;
  return `$${(n * 1000).toFixed(0)}M`;
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

  // Enrich companies with derived fields once
  const enriched = useMemo(() => {
    return companies.map(c => ({
      company: c,
      lead: leadDrug(c),
      science: leadScienceScore(c, scienceScores),
      next: nextCatalyst(c),
      runway: runwayQuarters(c),
      price: prices[c.ticker],
    }));
  }, [companies, prices, scienceScores]);

  // Filter + sort
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
        case 'science': {
          const av = a.science ?? -Infinity;
          const bv = b.science ?? -Infinity;
          return (av - bv) * dir;
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

  // Stat cards
  const stats = useMemo(() => {
    const positions = enriched.filter(r => r.company.entryTarget != null).length;
    const within30 = enriched.filter(r => r.next?.daysOut != null && r.next.daysOut >= 0 && r.next.daysOut <= 30).length;
    const within90 = enriched.filter(r => r.next?.daysOut != null && r.next.daysOut >= 0 && r.next.daysOut <= 90).length;
    const binaries30 = enriched.filter(r => r.next?.catalyst.binary && r.next?.daysOut != null && r.next.daysOut >= 0 && r.next.daysOut <= 30).length;
    return { total: enriched.length, positions, within30, within90, binaries30 };
  }, [enriched]);

  const sectors = useMemo(() => Array.from(new Set(companies.map(c => c.sector))), [companies]);

  return (
    <div className={styles.dashboard}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Watchlist Dashboard</h1>
          <p className={styles.subtitle}>
            {stats.total} names · {stats.within30} catalysts in 30d · {stats.within90} in 90d
          </p>
        </div>
        <button className={styles.addBtn} onClick={onQuickAdd}>+ Add Company</button>
      </div>

      {/* Stat cards */}
      <div className={styles.stats}>
        <StatCard label="Catalysts in 30 days" value={stats.within30} tone={stats.within30 > 0 ? 'warn' : 'neutral'} />
        <StatCard label="Catalysts in 90 days" value={stats.within90} tone="neutral" />
        <StatCard label="Binary events in 30d" value={stats.binaries30} tone={stats.binaries30 > 0 ? 'danger' : 'neutral'} />
        <StatCard label="With entry target" value={stats.positions} tone="success" />
      </div>

      {/* Filters */}
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

      {/* Table */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <Th onClick={() => toggleSort('ticker')} active={sortKey === 'ticker'} dir={sortDir}>Ticker</Th>
              <th>Lead Asset</th>
              <Th onClick={() => toggleSort('change')} active={sortKey === 'change'} dir={sortDir}>Price</Th>
              <Th onClick={() => toggleSort('next_catalyst')} active={sortKey === 'next_catalyst'} dir={sortDir}>Next Catalyst</Th>
              <th>Days</th>
              <Th onClick={() => toggleSort('science')} active={sortKey === 'science'} dir={sortDir}>Sci</Th>
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
            {visible.map(({ company, lead, science, next, runway, price }) => {
              const isFav = favorites.includes(company.ticker);
              const days = next?.daysOut;
              const urgency = days == null ? 'none' : days < 0 ? 'past' : days <= 30 ? 'hot' : days <= 90 ? 'warm' : 'cool';
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
                        <div className={styles.assetName}>{drugName(lead) || '—'}</div>
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
                          {next.catalyst.binary && <span className={styles.binaryFlag}>⚡</span>}
                          {next.catalyst.description || next.catalyst.type || 'Event'}
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
                    <span className={`${styles.scoreCell} ${scoreClass(science)}`}>
                      {science != null ? science.toFixed(1) : '—'}
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
        ★ favorite · ⚡ binary event · click any row to open detail
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

function StatCard({ label, value, tone }: { label: string; value: number; tone: 'neutral' | 'warn' | 'danger' | 'success' }) {
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
  if (p.includes('1')) return styles.phase1;
  if (p.includes('2')) return styles.phase2;
  if (p.includes('3')) return styles.phase3;
  if (p.includes('nda') || p.includes('bla') || p.includes('filed')) return styles.phaseFiled;
  if (p.includes('approved')) return styles.phaseApproved;
  return styles.phasePreclinical;
}

function scoreClass(score: number | null): string {
  if (score == null) return '';
  if (score >= 4) return styles.scoreHigh;
  if (score >= 3) return styles.scoreMid;
  return styles.scoreLow;
}