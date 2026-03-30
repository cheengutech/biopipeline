# arbi.to — BioPipeline

Personal biotech pipeline analyzer. Shkreli framework. Live prices via Finnhub. Persistent storage via Supabase.

---

## Stack

- **Next.js 14** (App Router)
- **Supabase** — watchlist, science scores, notes, favorites
- **Finnhub** — live stock quotes (server-side, key never exposed to client)
- **Chart.js** — radar, bar, pipeline charts
- **Vercel** — hosting

---

## Local Development

```bash
npm install
cp .env.local .env.local   # fill in your keys (see below)
npm run dev
# → http://localhost:3000/pipeline
```

---

## Environment Variables

Create `.env.local` in the project root:

```env
# Finnhub — get from finnhub.io
FINNHUB_API_KEY=your_finnhub_key_here

# Supabase — Settings > API in your Supabase project
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

**Never commit `.env.local`** — it's in `.gitignore`.

---

## Supabase Setup (one-time)

1. Go to [supabase.com](https://supabase.com) → New project
2. SQL Editor → New Query → paste contents of `supabase_schema.sql` → Run
3. Settings → API → copy Project URL and anon key into `.env.local`

---

## Deploy to Vercel

### Step 1 — Push to GitHub

```bash
git init
git add .
git commit -m "initial"
git remote add origin https://github.com/yourusername/arbito.git
git push -u origin main
```

### Step 2 — Import on Vercel

1. Go to [vercel.com](https://vercel.com) → New Project
2. Import your GitHub repo
3. Framework: **Next.js** (auto-detected)
4. Add environment variables:
   - `FINNHUB_API_KEY` → your key
   - `NEXT_PUBLIC_SUPABASE_URL` → your Supabase URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → your Supabase anon key
5. Click Deploy

### Step 3 — Connect arbi.to domain

In Vercel → your project → Settings → Domains:
1. Add `arbi.to`
2. Vercel will show you two DNS records to add

In your domain registrar (Namecheap or wherever):
```
Type    Host    Value
A       @       76.76.21.21
CNAME   www     cname.vercel-dns.com
```

DNS propagates in ~10 minutes. `arbi.to` → live.

---

## Project Structure

```
src/
  app/
    layout.tsx              # fonts, global styles
    page.tsx                # redirects to /pipeline
    globals.css
    pipeline/
      page.tsx              # /pipeline route
    api/
      price/
        route.ts            # Finnhub proxy (server-side)
  components/
    pipeline/
      PipelineApp.tsx       # main app, Supabase sync
      Sidebar.tsx           # company list, favorites, quick add
      CompanyDetail.tsx     # header, stats, tab router
      QuickAddModal.tsx     # fast ticker lookup + add
      OnboardModal.tsx      # 3-step full onboarding
      tabs/
        CatalystTab.tsx     # timeline + catalyst cards + EV
        ScienceTab.tsx      # 6-dim scorer + radar + CRL + comps
        PipelineTab.tsx     # pipeline table + charts
        MonteCarloTab.tsx   # MC simulation
        ValuationTab.tsx    # rNPV model + notes editor
  lib/
    supabase.ts             # Supabase client + DB helpers
    constants.ts            # FDA data, scoring, pipeline data
supabase_schema.sql         # run once in Supabase SQL editor
```

---

## Notes

- Prices auto-refresh every 5 minutes
- Science scores, favorites, notes, and watchlist all sync to Supabase instantly
- The Finnhub key is server-side only — never exposed in client code
- Default companies (IOVA, MRNA, NTLA, ARWR, RLAY) are seeded in `constants.ts`
- Quick Add: type any ticker → Enter → fills from Finnhub → select sector/phase → done
- Full Onboarding: 3-step flow for thesis, risks, entry target

---

## Adding New Companies

Fastest: use the Quick Add bar in the sidebar (type ticker + Enter).

For full pipeline detail: use Full Pipeline Onboarding button.

To add pre-loaded companies with detailed pipeline data, add an entry to `DEFAULT_COMPANIES` in `src/lib/constants.ts`.
