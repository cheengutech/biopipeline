# Dashboard Integration — PipelineApp.tsx Patch

The Dashboard is a watchlist-level view (not per-company), so it replaces the `CompanyDetail` main panel when active. Click any row → opens that company's detail (existing flow).

## File placement

```
src/components/pipeline/tabs/
  DashboardTab.tsx            ← new
  DashboardTab.module.css     ← new
```

Note: I put it under `tabs/` to match your existing structure. If your other tab components live there too (catalyst, science, etc.), this fits the pattern.

## Patch to PipelineApp.tsx

### 1. Add the import (top of file, with other imports)

```tsx
import DashboardTab from './tabs/DashboardTab';
```

### 2. Add a new state for "dashboard mode"

The cleanest way is a single boolean — when true, show Dashboard instead of CompanyDetail. Add this with the other useState hooks:

```tsx
const [showDashboard, setShowDashboard] = useState(true);  // start on dashboard
```

I'd recommend defaulting to `true` so dashboard is the landing view. If you'd rather keep the current per-company landing, set `false`.

### 3. Update the main panel render

Replace the existing `<main>` block:

```tsx
{/* Main content */}
<main className={styles.main}>
  {selectedCompany && (
    <CompanyDetail ... />
  )}
</main>
```

With this:

```tsx
{/* Main content */}
<main className={styles.main}>
  {showDashboard ? (
    <DashboardTab
      companies={companies}
      prices={prices}
      favorites={favorites}
      scienceScores={scienceScores}
      onSelect={(ticker) => {
        setSelectedTicker(ticker);
        setActiveTab('catalyst');
        setShowDashboard(false);
      }}
      onToggleFav={toggleFav}
      onQuickAdd={() => setShowQuickAdd(true)}
    />
  ) : (
    selectedCompany && (
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
    )
  )}
</main>
```

### 4. Add a "Dashboard" button to the Sidebar

You need a way to get back to the dashboard from a company detail view. Two options:

**Option A — quick (no Sidebar.tsx changes):** Add a button at the top of the header.

In the existing header block:

```tsx
<header className={styles.header}>
  <div className={styles.headerLeft}>
    <span className={styles.logo}>arbi<span>.to</span></span>
    <span className={styles.logoTag}>PIPELINE</span>
    {/* NEW: */}
    <button
      className={styles.headerNavBtn}
      onClick={() => setShowDashboard(true)}
      style={{
        marginLeft: 16,
        background: showDashboard ? 'var(--accent)' : 'transparent',
        color: showDashboard ? 'white' : 'var(--text-dim)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        padding: '4px 12px',
        fontSize: 12,
        cursor: 'pointer',
      }}
    >
      Dashboard
    </button>
  </div>
  ...
</header>
```

**Option B — proper integration:** Add a "Dashboard" entry at the top of `Sidebar.tsx`. That's cleaner but needs a Sidebar prop change. Do this when you have time:

```tsx
// In Sidebar.tsx props
showDashboard: boolean;
onShowDashboard: () => void;

// At the top of the sidebar list, before the company list
<button
  className={`${styles.dashboardBtn} ${showDashboard ? styles.active : ''}`}
  onClick={onShowDashboard}
>
  📊 Dashboard
</button>
```

Then pass `showDashboard={showDashboard}` and `onShowDashboard={() => setShowDashboard(true)}` from `PipelineApp.tsx`.

### 5. Update `onSelect` in the existing Sidebar handler

When clicking a company in the sidebar, also flip `showDashboard` off:

```tsx
onSelect={(ticker) => {
  setSelectedTicker(ticker);
  setActiveTab('catalyst');
  setShowDashboard(false);   // ← add this line
}}
```

## What this gives you

- Land on Dashboard by default — see all your watchlist names at once
- Catalyst counts in 30/90 days, binary event flag for risk concentration
- Sort by next-catalyst date (most useful sort), science score, market cap, runway, or % change
- Filter by sector, search by ticker/name, favorites-only toggle
- Click any row → opens existing `CompanyDetail` flow
- Header "Dashboard" button to get back

## What this does NOT do (intentionally)

- No schema changes — reads from your existing `pipeline` JSONB and `prices` state
- No new Supabase queries — purely a view layer over existing data
- Doesn't extend `QuickAddModal` — uses the existing flow as-is
- No catalyst calendar view (next iteration if you want it)

## Testing

1. Drop the two files in `src/components/pipeline/tabs/`
2. Apply the 5 patches to `PipelineApp.tsx`
3. Reload — you should land on the dashboard with whatever's already in your watchlist
4. Note: catalysts only show up if your `pipeline` JSONB on `watchlist` rows has a `catalysts: [...]` array on each drug. If you've been adding companies through the current `QuickAddModal`, the `catalysts` array is empty by default — so the "next catalyst" column will say "—" until you add some via your existing detail view (or extend the modal in a future iteration).

## If catalysts are sparse right now

The dashboard works without catalysts — you'll just see "—" in those columns. Sort by science score or mcap until you start adding catalyst data. The dashboard will become much more useful as you populate catalysts.

This is a real reason to consider extending `QuickAddModal` next: it currently sets `catalysts: []` on every drug, meaning the most valuable column on the dashboard is always empty. But that's a separate, deliberate next step — not this drop.