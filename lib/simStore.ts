/**
 * simStore.ts — Zustand persistent state for the simulated trading account.
 * Replaces static MOCK_SIM_ACCOUNT with a live, editable store.
 *
 * Persisted to localStorage under key "qp-sim-v1".
 * All pages reading sim-account data should import from here.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { MOCK_SIM_ACCOUNT } from "./mock-data";

// ── Types ────────────────────────────────────────────────────────
export type SimMarket = "A" | "HK" | "US";

export interface SimPos {
  symbol:       string;
  name:         string;
  market:       SimMarket;
  shares:       number;
  costPrice:    number;
  currentPrice: number;
  marketValue:  number;
  pnl:          number;
  pnlPct:       number;
  strategy?:    string;
  buyDate?:     string;
}

export interface SimTrade {
  id:        string;
  symbol:    string;
  name:      string;
  type:      "BUY" | "SELL";
  price:     number;
  shares:    number;
  amount:    number;         // shares * price
  fee:       number;
  pnl?:      number;         // realised P&L (sell only)
  strategy?: string;
  source:    "manual" | "strategy";
  createdAt: string;
}

// ── Fee rules (simplified, transparent) ─────────────────────────
export function calcTradeFee(
  market: SimMarket,
  amount: number,
  type: "BUY" | "SELL"
): number {
  if (market === "A") {
    const commission = Math.max(5, amount * 0.0003);        // ≥¥5
    const stamp      = type === "SELL" ? amount * 0.001 : 0; // 印花税，卖出单边
    return +(commission + stamp).toFixed(2);
  }
  if (market === "HK") return +(Math.max(3, amount * 0.001)).toFixed(2);
  return 0; // US: zero-commission simulation
}

export function calcFeeLabel(market: SimMarket, type: "BUY" | "SELL"): string {
  if (market === "A") return type === "SELL" ? "手续费（含印花税0.1%）" : "手续费";
  if (market === "HK") return "手续费（含佣金）";
  return "手续费";
}

// ── Store interface ──────────────────────────────────────────────
interface SimActions {
  sellPosition(p: {
    symbol: string;
    shares: number;
    price:  number;
    source?: "manual" | "strategy";
  }): void;

  buyPosition(p: {
    symbol:    string;
    name:      string;
    market:    SimMarket;
    shares:    number;
    price:     number;
    strategy?: string;
    source?:   "manual" | "strategy";
  }): void;

  updateCurrentPrices(prices: Record<string, number>): void;

  resetToInitial(): void;
}

export interface SimState extends SimActions {
  initialCapital: number;
  cash:           number;
  positions:      SimPos[];
  trades:         SimTrade[];
}

// ── Seed data from MOCK_SIM_ACCOUNT ─────────────────────────────
const SEED_POSITIONS: SimPos[] = MOCK_SIM_ACCOUNT.positions.map(p => ({
  symbol:       p.symbol,
  name:         p.name,
  market:       p.market as SimMarket,
  shares:       p.shares,
  costPrice:    p.costPrice,
  currentPrice: p.currentPrice,
  marketValue:  p.marketValue,
  pnl:          p.pnl,
  pnlPct:       p.pnlPct,
  strategy:     p.strategy,
}));

const SEED_TRADES: SimTrade[] = MOCK_SIM_ACCOUNT.trades.map(t => ({
  id:        t.id,
  symbol:    t.symbol,
  name:      t.name,
  type:      t.type,
  price:     t.price,
  shares:    t.shares,
  amount:    t.amount,
  fee:       t.fee,
  pnl:       t.pnl,
  strategy:  t.strategy,
  source:    "manual",
  createdAt: t.createdAt,
}));

// ── Store ────────────────────────────────────────────────────────
export const useSimStore = create<SimState>()(
  persist(
    (set) => ({
      initialCapital: MOCK_SIM_ACCOUNT.initialCapital,
      cash:           MOCK_SIM_ACCOUNT.cash,
      positions:      SEED_POSITIONS,
      trades:         SEED_TRADES,

      // ── Sell ──────────────────────────────────────────────────
      sellPosition({ symbol, shares, price, source = "manual" }) {
        set(st => {
          const pos = st.positions.find(p => p.symbol === symbol);
          if (!pos) return st;

          const actualShares = Math.min(Math.max(1, shares), pos.shares);
          const amount       = +(actualShares * price).toFixed(2);
          const fee          = calcTradeFee(pos.market, amount, "SELL");
          const proceeds     = +(amount - fee).toFixed(2);
          const realPnl      = +((price - pos.costPrice) * actualShares - fee).toFixed(2);

          const newPositions = st.positions
            .map(p => {
              if (p.symbol !== symbol) return p;
              const remaining = p.shares - actualShares;
              if (remaining <= 0) return null;
              const newMV     = +(remaining * p.currentPrice).toFixed(2);
              const newPnl    = +((p.currentPrice - p.costPrice) * remaining).toFixed(2);
              const newPnlPct = +((p.currentPrice - p.costPrice) / p.costPrice * 100).toFixed(2);
              return { ...p, shares: remaining, marketValue: newMV, pnl: newPnl, pnlPct: newPnlPct };
            })
            .filter(Boolean) as SimPos[];

          const newTrade: SimTrade = {
            id:        `sell-${Date.now()}`,
            symbol,
            name:      pos.name,
            type:      "SELL",
            price,
            shares:    actualShares,
            amount,
            fee,
            pnl:       realPnl,
            strategy:  pos.strategy,
            source,
            createdAt: new Date().toISOString(),
          };

          return {
            positions: newPositions,
            cash:      +(st.cash + proceeds).toFixed(2),
            trades:    [newTrade, ...st.trades],
          };
        });
      },

      // ── Buy ───────────────────────────────────────────────────
      buyPosition({ symbol, name, market, shares, price, strategy, source = "manual" }) {
        set(st => {
          const amount    = +(shares * price).toFixed(2);
          const fee       = calcTradeFee(market, amount, "BUY");
          const totalCost = +(amount + fee).toFixed(2);
          if (st.cash < totalCost) return st; // insufficient funds

          const existing = st.positions.find(p => p.symbol === symbol);
          let newPositions: SimPos[];

          if (existing) {
            const totalShares  = existing.shares + shares;
            const newCost      = +((existing.costPrice * existing.shares + price * shares) / totalShares).toFixed(2);
            const newMV        = +(totalShares * existing.currentPrice).toFixed(2);
            const newPnl       = +((existing.currentPrice - newCost) * totalShares).toFixed(2);
            const newPnlPct    = +((existing.currentPrice - newCost) / newCost * 100).toFixed(2);
            newPositions = st.positions.map(p =>
              p.symbol === symbol
                ? { ...p, shares: totalShares, costPrice: newCost, marketValue: newMV, pnl: newPnl, pnlPct: newPnlPct, strategy: strategy ?? p.strategy }
                : p
            );
          } else {
            newPositions = [...st.positions, {
              symbol, name, market,
              shares, costPrice: price, currentPrice: price,
              marketValue: amount, pnl: 0, pnlPct: 0, strategy,
            }];
          }

          const newTrade: SimTrade = {
            id: `buy-${Date.now()}`,
            symbol, name, type: "BUY",
            price, shares, amount, fee, strategy, source,
            createdAt: new Date().toISOString(),
          };

          return {
            positions: newPositions,
            cash:      +(st.cash - totalCost).toFixed(2),
            trades:    [newTrade, ...st.trades],
          };
        });
      },

      // ── Update current prices (from live quotes) ─────────────
      updateCurrentPrices(prices) {
        set(st => ({
          positions: st.positions.map(p => {
            const np = prices[p.symbol];
            if (!np || np <= 0 || Math.abs(np - p.currentPrice) < 0.001) return p;
            const newMV     = +(p.shares * np).toFixed(2);
            const newPnl    = +((np - p.costPrice) * p.shares).toFixed(2);
            const newPnlPct = +((np - p.costPrice) / p.costPrice * 100).toFixed(2);
            return { ...p, currentPrice: np, marketValue: newMV, pnl: newPnl, pnlPct: newPnlPct };
          }),
        }));
      },

      // ── Reset to seed data ────────────────────────────────────
      resetToInitial() {
        set({
          initialCapital: MOCK_SIM_ACCOUNT.initialCapital,
          cash:           MOCK_SIM_ACCOUNT.cash,
          positions:      SEED_POSITIONS,
          trades:         SEED_TRADES,
        });
      },
    }),
    {
      name: "qp-sim-v1",
      storage: createJSONStorage(() =>
        typeof window !== "undefined"
          ? window.localStorage
          : { getItem: () => null, setItem: () => {}, removeItem: () => {} }
      ),
    }
  )
);

// ── Derived helpers (use outside React) ─────────────────────────
export function simTotals(cash: number, positions: SimPos[], initialCapital: number) {
  const invested      = positions.reduce((s, p) => s + p.marketValue, 0);
  const totalValue    = +(cash + invested).toFixed(2);
  const totalReturn   = +(totalValue - initialCapital).toFixed(2);
  const totalReturnPct = +((totalReturn / initialCapital) * 100).toFixed(2);
  return { totalValue, totalReturn, totalReturnPct, invested };
}
