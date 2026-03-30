import { NextRequest, NextResponse } from 'next/server';

const FINNHUB_KEY = process.env.FINNHUB_API_KEY!;
const BASE = 'https://finnhub.io/api/v1';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get('ticker')?.toUpperCase();
  if (!ticker) return NextResponse.json({ error: 'No ticker' }, { status: 400 });

  try {
    const [quoteRes, profileRes] = await Promise.all([
      fetch(`${BASE}/quote?symbol=${ticker}&token=${FINNHUB_KEY}`, { next: { revalidate: 60 } }),
      fetch(`${BASE}/stock/profile2?symbol=${ticker}&token=${FINNHUB_KEY}`, { next: { revalidate: 3600 } }),
    ]);

    const [quote, profile] = await Promise.all([quoteRes.json(), profileRes.json()]);

    if (!quote || quote.c === 0) {
      return NextResponse.json({ error: 'Ticker not found' }, { status: 404 });
    }

    return NextResponse.json({
      ticker,
      price: quote.c,
      previousClose: quote.pc,
      change: quote.pc ? ((quote.c - quote.pc) / quote.pc) * 100 : 0,
      high: quote.h,
      low: quote.l,
      open: quote.o,
      fiftyTwoWeekHigh: quote.h,
      fiftyTwoWeekLow: quote.l,
      name: profile.name || ticker,
      mktCap: profile.marketCapitalization ? profile.marketCapitalization / 1000 : null, // millions → $B
      sector: profile.finnhubIndustry || null,
      exchange: profile.exchange || null,
      logo: profile.logo || null,
      ts: Date.now(),
    });
  } catch (e) {
    console.error('Finnhub error:', e);
    return NextResponse.json({ error: 'Fetch failed' }, { status: 500 });
  }
}
