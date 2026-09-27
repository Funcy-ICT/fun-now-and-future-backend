import { Timestamp } from "firebase-admin/firestore";
import {
  getBaselineConfig,
  getCongestionRecordsForDay,
  getDailySummaries,
  getRecentLocations,
  saveDailySummary,
  saveExcludedDay,
  saveMaxDevice,
} from "../repositories/firestore";
import { BaselineSettings } from "../schema/baseline_settings";
import { DailySummary } from "../schema/daily_summary";
import { resolveSettings } from "./baseline_settings";
import { buildDailySummary, isSummaryStale } from "./daily_summary";
import { calcBaseline, calcRefMedian, evaluateDay } from "./baseline";
import { jstDate, jstDateStartMs, jstDaysBefore, operatingRangeMs } from "./jst";
import { jstWeekday } from "./scan_service";

// 1回のバッチで作り直すまとめの数の上限。1日分の作成で最大180件読むので、読み取りが無料枠を超えないようにする。
// 初回は26週分が揃っていないため、数日かけて埋まる。
const MAX_SUMMARIES_PER_RUN = 120;

// 作り直せる残りの数。(location, 曜日)をまたいで共有する
type Budget = { remaining: number };

// locationの一覧を取るために読む期間
const RECENT_LOCATION_DAYS = 1;

const DAY_MS = 24 * 60 * 60 * 1000;

// 対象の日(その曜日の直近から、refMedianWeeks週前まで)を新しい順に並べる。当日は含めない。
export const targetDates = (today: string, weekday: number, weeks: number): string[] => {
  const dates: string[] = [];
  for (let back = 1; back <= 7; back++) {
    if (jstWeekday(jstDateStartMs(jstDaysBefore(today, back))) === weekday) {
      for (let w = 0; w < weeks; w++) {
        dates.push(jstDaysBefore(today, back + w * 7));
      }
      break;
    }
  }
  return dates;
};

// 足りないまとめ、または稼働時間帯が変わったまとめを作り直す。1回のバッチで作る数には上限を設ける。
const refreshSummaries = async (
  location: string,
  weekday: number,
  dates: string[],
  settings: BaselineSettings,
  budget: Budget,
): Promise<Map<string, DailySummary>> => {
  const summaries = await getDailySummaries(location, dates);

  for (const date of dates) {
    const summary = summaries.get(date);
    if (summary !== undefined && !isSummaryStale(summary, settings)) continue;
    if (budget.remaining <= 0) break;

    const { start, end } = operatingRangeMs(date, settings.operatingStartHour, settings.operatingEndHour);
    const records = await getCongestionRecordsForDay(location, weekday, Timestamp.fromMillis(start), Timestamp.fromMillis(end));
    const input = buildDailySummary(location, date, weekday, records, settings);
    await saveDailySummary(input);
    summaries.set(date, { ...input, computedAt: Timestamp.now() });
    budget.remaining -= 1;
  }

  return summaries;
};

export type CalcResult = "written" | "frozen";

// (location, 曜日)ごとの計算。発行しない場合はmax_devicesを書き換えない(未発行なら無いまま、発行済みなら凍結)。
export const calcMaxDeviceFor = async (
  location: string,
  weekday: number,
  today: string,
  settings: BaselineSettings,
  budget: Budget,
): Promise<CalcResult> => {
  const dates = targetDates(today, weekday, settings.refMedianWeeks);
  const summaries = await refreshSummaries(location, weekday, dates, settings, budget);

  const refMedian = calcRefMedian(dates.map(date => summaries.get(date)).filter((s): s is DailySummary => s !== undefined));
  if (refMedian === null) return "frozen";

  const valid: DailySummary[] = [];
  let lookbackWeeks = 0;

  for (const date of dates.slice(0, settings.maxLookbackWeeks)) {
    lookbackWeeks += 1;
    const evaluation = evaluateDay(date, summaries.get(date), refMedian, settings);

    if (!evaluation.valid) {
      await saveExcludedDay({
        location,
        date,
        weekday,
        reason: evaluation.reason,
        slotCount: evaluation.slotCount,
        dayMedian: evaluation.dayMedian,
        refMedian,
        ratio: evaluation.ratio,
      });
      continue;
    }

    valid.push(evaluation.summary);
    if (valid.length >= settings.targetDays) break;
  }

  if (valid.length < settings.targetDays) return "frozen";

  const result = calcBaseline(valid, settings);
  if (result === null) return "frozen";

  await saveMaxDevice({
    location,
    weekday,
    baseline: result.baseline,
    percentile: settings.percentile,
    p50: result.p50,
    p05: result.p05,
    windowStartHour: settings.operatingStartHour,
    windowEndHour: settings.operatingEndHour,
    sampleDays: valid.length,
    sampleCount: result.sampleCount,
    lookbackWeeks,
    oldestSampleDate: result.oldestSampleDate,
    refMedian,
  });
  return "written";
};

export type BatchResult = { succeeded: number; failed: number; frozen: number };

// (location, 曜日)ごとに独立して実行する。1件の失敗が他に影響しないようにする。
export const calcMaxDevices = async (now: Date): Promise<BatchResult> => {
  const today = jstDate(now.getTime());
  const config = await getBaselineConfig();
  const locations = await getRecentLocations(Timestamp.fromMillis(now.getTime() - RECENT_LOCATION_DAYS * DAY_MS));

  const result: BatchResult = { succeeded: 0, failed: 0, frozen: 0 };
  const budget: Budget = { remaining: MAX_SUMMARIES_PER_RUN };

  for (const location of locations) {
    const settings = resolveSettings(config, location);
    for (let weekday = 0; weekday < 7; weekday++) {
      try {
        const status = await calcMaxDeviceFor(location, weekday, today, settings, budget);
        if (status === "written") result.succeeded += 1;
        else result.frozen += 1;
      } catch (error) {
        console.error(`Failed to calculate max_devices for ${location} weekday ${weekday}:`, error);
        result.failed += 1;
      }
    }
  }

  console.info("calc-max-device finished", { locationCount: locations.length, ...result });
  return result;
};
