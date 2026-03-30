import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ── DATABASE HELPERS ──────────────────────────────────────────────────────────

// Watchlist
export async function getWatchlist() {
  const { data, error } = await supabase.from('watchlist').select('*').order('created_at', { ascending: false });
  if (error) { console.error('getWatchlist:', error); return []; }
  return data;
}

export async function upsertWatchlistEntry(entry: WatchlistEntry) {
  const { error } = await supabase.from('watchlist').upsert(entry, { onConflict: 'ticker' });
  if (error) console.error('upsertWatchlistEntry:', error);
}

export async function deleteWatchlistEntry(ticker: string) {
  const { error } = await supabase.from('watchlist').delete().eq('ticker', ticker);
  if (error) console.error('deleteWatchlistEntry:', error);
}

// Science scores
export async function getScienceScores() {
  const { data, error } = await supabase.from('science_scores').select('*');
  if (error) { console.error('getScienceScores:', error); return []; }
  return data;
}

export async function upsertScienceScore(entry: ScienceScoreEntry) {
  const { error } = await supabase.from('science_scores').upsert(entry, { onConflict: 'key' });
  if (error) console.error('upsertScienceScore:', error);
}

// Notes
export async function getNotes() {
  const { data, error } = await supabase.from('notes').select('*');
  if (error) { console.error('getNotes:', error); return []; }
  return data;
}

export async function upsertNote(entry: NoteEntry) {
  const { error } = await supabase.from('notes').upsert(entry, { onConflict: 'ticker' });
  if (error) console.error('upsertNote:', error);
}

// Favorites
export async function getFavorites(): Promise<string[]> {
  const { data, error } = await supabase.from('favorites').select('ticker');
  if (error) { console.error('getFavorites:', error); return []; }
  return data.map((r: any) => r.ticker);
}

export async function toggleFavorite(ticker: string, isFav: boolean) {
  if (isFav) {
    await supabase.from('favorites').delete().eq('ticker', ticker);
  } else {
    await supabase.from('favorites').insert({ ticker });
  }
}

// ── TYPES ──────────────────────────────────────────────────────────────────────
export interface WatchlistEntry {
  ticker: string;
  name: string;
  sector: string;
  mkt_cap: number;
  cash: number;
  burn_rate: number;
  pipeline: any[];
  entry_target?: number | null;
  created_at?: string;
}

export interface ScienceScoreEntry {
  key: string; // ticker_drugname
  scores: Record<string, number>;
  updated_at?: string;
}

export interface NoteEntry {
  ticker: string;
  thesis: string;
  risks: string;
  updated_at?: string;
}
