'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { DEFAULT_COMPANIES, calcCompanyScore } from '@/lib/constants';
import { supabase } from '@/lib/supabase';
import styles from './Pipeline.module.css';
import Sidebar from './Sidebar';
import CompanyDetail from './CompanyDetail';
import QuickAddModal from './QuickAddModal';
import OnboardModal from './OnboardModal';

export default function PipelineApp() {
  const [companies, setCompanies] = useState<any[]>(DEFAULT_COMPANIES);
  const [selectedTicker, setSelectedTicker] = useState<string>('IOVA');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [scienceScores, setScienceScores] = useState<Record<string, Record<string, number>>>({});
  const [notes, setNotes] = useState<Record<string, { thesis: string; risks: string }>>({});
  const [prices, setPrices] = useState<Record<string, any>>({});
  const [priceStatus, setPriceStatus] = useState('');
  const [sidebarView, setSidebarView] = useState<'all' | 'favs'>('all');
  const [sectorFilter, setSectorFilter] = useState('all');
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showOnboard, setShowOnboard] = useState(false);
  const [activeTab, setActiveTab] = useState('catalyst');
  const priceIntervalRef = useRef<NodeJS.Timeout>();

  const selectedCompany = companies.find(c => c.ticker === selectedTicker) ?? companies[0];

  // ── Load from Supabase on mount ───────────────────────────────────────────
  useEffect(() => {
    loadFromSupabase();
    fetchAllPrices();
    priceIntervalRef.current = setInterval(fetchAllPrices, 300_000);
    return () => { if (priceIntervalRef.current) clearInterval(priceIntervalRef.current); };
  }, []);

  async function loadFromSupabase() {
    try {
      const [wl, sci, nt, favs] = await Promise.all([
        supabase.from('watchlist').select('*').order('created_at', { ascending: false }),
        supabase.from('science_scores').select('*'),
        supabase.from('notes').select('*'),
        supabase.from('favorites').select('ticker'),
      ]);

      // Merge watchlist companies with defaults (watchlist takes precedence)
      if (wl.data && wl.data.length > 0) {
        const wlCompanies = wl.data.map((row: any) => ({
          name: row.name, ticker: row.ticker, sector: row.sector,
          mktCap: row.mkt_cap, price: row.price ?? 0, priceChange: 0,
          cash: row.cash, burnRate: row.burn_rate,
          pipeline: row.pipeline ?? [],
          entryTarget: row.entry_target,
        }));
        // Merge: keep defaults that aren't in watchlist, add watchlist entries
        const wlTickers = new Set(wlCompanies.map((c: any) => c.ticker));
        const merged = [
          ...wlCompanies,
          ...DEFAULT_COMPANIES.filter(c => !wlTickers.has(c.ticker)),
        ];
        setCompanies(merged);
      }

      // Science scores
      if (sci.data) {
        const map: Record<string, Record<string, number>> = {};
        sci.data.forEach((row: any) => { map[row.key] = row.scores; });
        setScienceScores(map);
      }

      // Notes
      if (nt.data) {
        const map: Record<string, { thesis: string; risks: string }> = {};
        nt.data.forEach((row: any) => { map[row.ticker] = { thesis: row.thesis, risks: row.risks }; });
        setNotes(map);
      }

      // Favorites
      if (favs.data) {
        setFavorites(favs.data.map((r: any) => r.ticker));
      }
    } catch (e) {
      console.warn('Supabase load failed — using local state only', e);
    }
  }

  // ── Price fetching via Next.js API route (Finnhub, server-side key) ───────
  async function fetchPrice(ticker: string) {
    try {
      const r = await fetch(`/api/price?ticker=${ticker}`);
      if (!r.ok) return null;
      const data = await r.json();
      if (data.error) return null;
      return data;
    } catch { return null; }
  }

  async function fetchAllPrices() {
    const tickers = companies.map(c => c.ticker);
    setPriceStatus('Fetching prices...');
    let done = 0;
    await Promise.all(tickers.map(async (t) => {
      const data = await fetchPrice(t);
      if (data) {
        setPrices(prev => ({ ...prev, [t]: data }));
      }
      done++;
      setPriceStatus(`Prices: ${done}/${tickers.length}`);
    }));
    setPriceStatus('');
  }

  // ── Favorites ─────────────────────────────────────────────────────────────
  const toggleFav = useCallback(async (ticker: string) => {
    const isFav = favorites.includes(ticker);
    const next = isFav ? favorites.filter(t => t !== ticker) : [...favorites, ticker];
    setFavorites(next);
    try {
      if (isFav) {
        await supabase.from('favorites').delete().eq('ticker', ticker);
      } else {
        await supabase.from('favorites').insert({ ticker });
      }
    } catch (e) { console.warn('Supabase fav error', e); }
  }, [favorites]);

  // ── Science score update ──────────────────────────────────────────────────
  const updateScienceScore = useCallback(async (key: string, dim: string, val: number) => {
    setScienceScores(prev => {
      const existing = prev[key] ?? {};
      const updated = { ...existing, [dim]: val };
      // Persist to Supabase
      supabase.from('science_scores').upsert({ key, scores: updated, updated_at: new Date().toISOString() }, { onConflict: 'key' })
        .then(({ error }) => { if (error) console.warn('science score save error', error); });
      return { ...prev, [key]: updated };
    });
  }, []);

  // ── Add company (from quick add or onboard) ───────────────────────────────
  const addCompany = useCallback(async (company: any) => {
    setCompanies(prev => {
      if (prev.find(c => c.ticker === company.ticker)) return prev;
      return [company, ...prev];
    });
    setSelectedTicker(company.ticker);
    setActiveTab('catalyst');
    // Save to Supabase watchlist
    try {
      await supabase.from('watchlist').upsert({
        ticker: company.ticker, name: company.name, sector: company.sector,
        mkt_cap: company.mktCap, price: company.price, cash: company.cash,
        burn_rate: company.burnRate, pipeline: company.pipeline,
        entry_target: company.entryTarget ?? null,
      }, { onConflict: 'ticker' });
    } catch (e) { console.warn('Supabase add company error', e); }
    // Fetch price
    const data = await fetchPrice(company.ticker);
    if (data) setPrices(prev => ({ ...prev, [company.ticker]: data }));
  }, []);

  // ── Save notes ────────────────────────────────────────────────────────────
  const saveNotes = useCallback(async (ticker: string, thesis: string, risks: string) => {
    setNotes(prev => ({ ...prev, [ticker]: { thesis, risks } }));
    try {
      await supabase.from('notes').upsert({ ticker, thesis, risks, updated_at: new Date().toISOString() }, { onConflict: 'ticker' });
    } catch (e) { console.warn('notes save error', e); }
  }, []);

  return (
    <div className={styles.app}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.logo}>arbi<span>.to</span></span>
          <span className={styles.logoTag}>PIPELINE</span>
        </div>
        <div className={styles.headerRight}>
          {priceStatus && <span className={styles.priceStatus}>{priceStatus}</span>}
          <span className={styles.headerMeta}>
            <span className={styles.liveDot} /> Finnhub · Live Prices · Supabase Sync
          </span>
        </div>
      </header>

      <div className={styles.layout}>
        {/* Sidebar */}
        <Sidebar
          companies={companies}
          selectedTicker={selectedTicker}
          favorites={favorites}
          prices={prices}
          sidebarView={sidebarView}
          sectorFilter={sectorFilter}
          scienceScores={scienceScores}
          onSelect={(ticker) => { setSelectedTicker(ticker); setActiveTab('catalyst'); }}
          onToggleFav={toggleFav}
          onSetView={setSidebarView}
          onSetSector={setSectorFilter}
          onQuickAdd={() => setShowQuickAdd(true)}
          onFullOnboard={() => setShowOnboard(true)}
        />

        {/* Main content */}
        <main className={styles.main}>
          {selectedCompany && (
            <CompanyDetail
              company={selectedCompany}
              price={prices[selectedCompany.ticker]}
              scienceScores={scienceScores}
              notes={notes[selectedCompany.ticker]}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onScienceScore={updateScienceScore}
              onSaveNotes={saveNotes}
            />
          )}
        </main>
      </div>

      {/* Modals */}
      {showQuickAdd && (
        <QuickAddModal
          onClose={() => setShowQuickAdd(false)}
          onAdd={addCompany}
          existingTickers={companies.map(c => c.ticker)}
        />
      )}
      {showOnboard && (
        <OnboardModal
          onClose={() => setShowOnboard(false)}
          onAdd={addCompany}
          existingTickers={companies.map(c => c.ticker)}
        />
      )}
    </div>
  );
}
