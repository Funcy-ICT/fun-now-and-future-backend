import { DailySummary } from "../schema/daily_summary";
import { BaselineSettings, MIN_BASELINE } from "../schema/baseline_settings";
import { median, medianOfSorted, percentileOfSorted } from "./statistics";

const SLOTS_PER_HOUR = 12; // 5分窓

export const expectedSlotCount = (settings: BaselineSettings): number =>
  (settings.operatingEndHour - settings.operatingStartHour) * SLOTS_PER_HOUR;

// ゲートを通していない全日から作る参照値。除外した日だけで作ると、出力が入力を決める循環になり、
// 恒久的な人出の変化を異常として棄却し続ける(issue #24 Decision 3)。
export const calcRefMedian = (summaries: DailySummary[]): number | null => {
  const dayMedians = summaries
    .map(summary => summary.dayMedian)
    .filter((value): value is number => value !== null);
  return dayMedians.length === 0 ? null : median(dayMedians);
};

export type DayEvaluation =
  | { date: string; valid: true; summary: DailySummary }
  | { date: string; valid: false; reason: "incomplete" | "statistical"; slotCount: number; dayMedian: number | null; ratio: number | null };

// 完全性ゲートはノード停止を、水準ゲートは休業日を弾く。順序は完全性が先で、
// ノードが半日落ちた日を「人が少ない日」と取り違えないようにする。
export const evaluateDay = (
  date: string,
  summary: DailySummary | undefined,
  refMedian: number,
  settings: BaselineSettings,
): DayEvaluation => {
  const slotCount = summary?.slotCount ?? 0;
  const dayMedian = summary?.dayMedian ?? null;
  const ratio = dayMedian === null || refMedian === 0 ? null : dayMedian / refMedian;

  if (slotCount < expectedSlotCount(settings) * settings.completenessRatio) {
    return { date, valid: false, reason: "incomplete", slotCount, dayMedian, ratio };
  }
  if (dayMedian === null || dayMedian < refMedian * settings.gateRatio) {
    return { date, valid: false, reason: "statistical", slotCount, dayMedian, ratio };
  }
  return { date, valid: true, summary: summary! };
};

export type BaselineResult = {
  baseline: number;
  p50: number;
  p05: number;
  sampleCount: number;
  oldestSampleDate: string;
};

// 有効日の窓をすべてプールしてパーセンタイルを取る。baselineが9未満なら、9段階が成立しないので発行しない。
export const calcBaseline = (validDays: DailySummary[], settings: BaselineSettings): BaselineResult | null => {
  const pool = validDays.flatMap(day => day.counts).sort((a, b) => a - b);
  if (pool.length === 0) return null;

  const baseline = percentileOfSorted(pool, settings.percentile);
  if (baseline < MIN_BASELINE) return null;

  return {
    baseline,
    p50: medianOfSorted(pool),
    p05: percentileOfSorted(pool, 0.05),
    sampleCount: pool.length,
    oldestSampleDate: validDays.map(day => day.date).sort()[0],
  };
};
