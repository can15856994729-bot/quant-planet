/**
 * strategyConfigStore.ts — 策略配置持久化存储
 *
 * 用于保存回测后的最优参数配置，可接入模拟盘。
 * 使用 Zustand + localStorage 持久化，最多保存 5 条。
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface SavedStrategyConfig {
  id:              string;   // 唯一 ID（时间戳）
  name:            string;   // 用户自定义名称或自动生成
  savedAt:         string;   // ISO 时间戳
  // ── 策略参数 ─────────────────────────────────────
  maxPositions:    number;
  rebalanceFreq:   "weekly" | "monthly";
  maxSingleWeight: number;   // 0–1
  stopLossRate:    number;   // 0–1, 0 = 不止损
  takeProfitRate:  number;   // 0–1, 0 = 不止盈
  scoreThreshold:  number;   // 50–90
  commissionRate:  number;   // 0.0003 etc.
  // ── 回测摘要（展示用）──────────────────────────────
  backtestReturn:  number;   // %
  backtestAnnual:  number;   // %
  backtestSharpe:  number;
  backtestMaxDD:   number;   // % (负值)
  backtestScore:   number;   // 0–100
  startDate:       string;
  endDate:         string;
}

interface StrategyConfigState {
  configs:        SavedStrategyConfig[];
  activeConfigId: string | null;
  saveConfig:     (config: SavedStrategyConfig) => void;
  removeConfig:   (id: string) => void;
  setActive:      (id: string | null) => void;
}

const _storage =
  typeof window !== "undefined"
    ? window.localStorage
    : {
        getItem:    () => null,
        setItem:    () => {},
        removeItem: () => {},
      };

export const useStrategyConfigStore = create<StrategyConfigState>()(
  persist(
    (set) => ({
      configs:        [],
      activeConfigId: null,
      saveConfig: (config) =>
        set((s) => ({
          configs: [config, ...s.configs.filter((c) => c.id !== config.id)].slice(0, 5),
        })),
      removeConfig: (id) =>
        set((s) => ({
          configs:        s.configs.filter((c) => c.id !== id),
          activeConfigId: s.activeConfigId === id ? null : s.activeConfigId,
        })),
      setActive: (id) => set({ activeConfigId: id }),
    }),
    {
      name:    "qp-strategy-config-v1",
      storage: createJSONStorage(() => _storage),
    }
  )
);
