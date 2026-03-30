-- ============================================================
-- arbi.to — BioPipeline Supabase Schema
-- Run this in your Supabase project: SQL Editor → New Query
-- ============================================================

-- Watchlist: custom companies you've added
create table if not exists watchlist (
  ticker       text primary key,
  name         text not null,
  sector       text not null default 'oncology',
  mkt_cap      numeric default 1.0,
  price        numeric default 0,
  cash         numeric default 0.3,
  burn_rate    numeric default 0.1,
  pipeline     jsonb default '[]'::jsonb,
  entry_target numeric,
  created_at   timestamptz default now()
);

-- Science scores: per drug dimension overrides
create table if not exists science_scores (
  key        text primary key,  -- format: TICKER_DrugName
  scores     jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- Notes: thesis and risks per company
create table if not exists notes (
  ticker     text primary key,
  thesis     text default '',
  risks      text default '',
  updated_at timestamptz default now()
);

-- Favorites: starred tickers
create table if not exists favorites (
  ticker     text primary key,
  created_at timestamptz default now()
);

-- ============================================================
-- Row Level Security — single personal user, no auth needed
-- Since this is personal, we disable RLS and use anon key
-- ============================================================
alter table watchlist      disable row level security;
alter table science_scores disable row level security;
alter table notes          disable row level security;
alter table favorites      disable row level security;

-- If you ever want to add auth later, re-enable RLS and add policies:
-- alter table watchlist enable row level security;
-- create policy "owner access" on watchlist for all using (true);
