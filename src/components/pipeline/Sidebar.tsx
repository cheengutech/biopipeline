'use client';

import { calcCompanyScore } from '@/lib/constants';
import styles from './Sidebar.module.css';

interface Props {
  companies: any[];
  selectedTicker: string;
  favorites: string[];
  prices: Record<string, any>;
  sidebarView: 'all' | 'favs';
  sectorFilter: string;
  scienceScores: Record<string, Record<string, number>>;
  onSelect: (ticker: string) => void;
  onToggleFav: (ticker: string) => void;
  onSetView: (v: 'all' | 'favs') => void;
  onSetSector: (s: string) => void;
  onQuickAdd: () => void;
  onFullOnboard: () => void;
}

const SECTORS = ['all','oncology','immunology','neurology','rare','cardio'];
const SECTOR_LABELS: Record<string,string> = { all:'All', oncology:'Oncology', immunology:'Immuno', neurology:'Neuro', rare:'Rare', cardio:'Cardio' };

export default function Sidebar({
  companies, selectedTicker, favorites, prices, sidebarView, sectorFilter,
  scienceScores, onSelect, onToggleFav, onSetView, onSetSector, onQuickAdd, onFullOnboard
}: Props) {

  let filtered = sectorFilter === 'all' ? companies : companies.filter(c => c.sector === sectorFilter);
  if (sidebarView === 'favs') filtered = filtered.filter(c => favorites.includes(c.ticker));

  return (
    <aside className={styles.sidebar}>
      {/* View toggle */}
      <div className={styles.viewBtns}>
        <button className={`${styles.viewBtn} ${sidebarView==='all'?styles.viewBtnActive:''}`} onClick={() => onSetView('all')}>All</button>
        <button className={`${styles.viewBtn} ${sidebarView==='favs'?styles.viewBtnActive:''}`} onClick={() => onSetView('favs')}>★ Favorites</button>
      </div>

      {/* Quick add bar */}
      <div className={styles.quickAddBar}>
        <input
          className={styles.quickInput}
          placeholder="Ticker (e.g. IOVA)"
          maxLength={8}
          onKeyDown={(e) => { if (e.key === 'Enter') onQuickAdd(); }}
          id="quickTickerInput"
          style={{ textTransform: 'uppercase' }}
        />
        <button className={styles.quickBtn} onClick={onQuickAdd}>+ Add</button>
      </div>

      {/* Sector filters */}
      <div className={styles.filterRow}>
        {SECTORS.map(s => (
          <button
            key={s}
            className={`${styles.chip} ${sectorFilter===s?styles.chipActive:''}`}
            onClick={() => onSetSector(s)}
          >
            {SECTOR_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Company list */}
      <div className={styles.list}>
        {filtered.length === 0 ? (
          <div className={styles.empty}>
            {sidebarView === 'favs' ? 'No favorites yet. Star a company to add it.' : 'No companies match this filter.'}
          </div>
        ) : filtered.map(c => {
          const score = calcCompanyScore(c, scienceScores);
          const scoreClass = score >= 60 ? styles.scoreHigh : score >= 35 ? styles.scoreMid : styles.scoreLow;
          const live = prices[c.ticker];
          const price = live?.price ?? c.price;
          const change = live?.change ?? c.priceChange ?? 0;
          const isActive = c.ticker === selectedTicker;
          const isFav = favorites.includes(c.ticker);

          return (
            <div
              key={c.ticker}
              className={`${styles.card} ${isActive ? styles.cardActive : ''}`}
              onClick={() => onSelect(c.ticker)}
            >
              <div className={styles.cardTop}>
                <div className={styles.cardLeft}>
                  <span className={styles.ticker}>{c.ticker}</span>
                  <button
                    className={`${styles.favBtn} ${isFav ? styles.favBtnActive : ''}`}
                    onClick={(e) => { e.stopPropagation(); onToggleFav(c.ticker); }}
                    title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    {isFav ? '★' : '☆'}
                  </button>
                </div>
                <div className={styles.cardRight}>
                  <div className={`${styles.priceVal} ${change >= 0 ? styles.priceUp : styles.priceDown}`}>
                    {live ? `$${price.toFixed(2)}` : '···'}
                  </div>
                  <div className={`${styles.priceChange} ${change >= 0 ? styles.priceUp : styles.priceDown}`}>
                    {change >= 0 ? '▲' : '▼'}{Math.abs(change).toFixed(1)}%
                  </div>
                </div>
              </div>
              <div className={styles.companyName}>{c.name}</div>
              <div className={styles.cardBottom}>
                <span className={styles.sector}>{c.sector.charAt(0).toUpperCase()+c.sector.slice(1)} · {c.pipeline.length} assets</span>
                <span className={`${styles.score} ${scoreClass}`}>{score}</span>
              </div>
            </div>
          );
        })}
      </div>

      <button className={styles.onboardBtn} onClick={onFullOnboard}>+ Full Pipeline Onboarding</button>

      {/* Framework reference */}
      <div className={styles.reference}>
        <div className={styles.refTitle}>Shkreli Framework</div>
        {[
          ['Science quality','30%','var(--text)'],
          ['Competitive moat','25%','var(--text)'],
          ['Cash runway','20%','var(--text)'],
          ['Deal structure','15%','var(--text)'],
          ['Catalyst density','10%','var(--text)'],
        ].map(([k,v,c]) => (
          <div key={k} className={styles.refRow}>
            <span>{k}</span><span style={{color:c, fontFamily:'var(--font-mono)'}}>{v}</span>
          </div>
        ))}
        <div className={styles.refDivider}/>
        {[
          ['Genetic evidence','+1.4×','var(--success)'],
          ['Royalty ≥8%','−value','var(--danger)'],
          ['First-in-class','0.90×','var(--warn)'],
        ].map(([k,v,c]) => (
          <div key={k} className={styles.refRow}>
            <span>{k}</span><span style={{color:c, fontFamily:'var(--font-mono)'}}>{v}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}
