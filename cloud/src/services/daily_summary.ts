import { CongestionRecord } from "../schema/congestion_record";
import { DailySummaryInput } from "../schema/daily_summary";
import { BaselineSettings } from "../schema/baseline_settings";
import { medianOfSorted } from "./statistics";
import { jstHour } from "./jst";

// 1日分の記録から、まとめを作る。稼働時間帯の外の記録は数えない。
// 記録が1件も無い日はdayMedianをnullにする。ノードが落ちていた日と、誰も居なかった日を区別するため。
export const buildDailySummary = (
  location: string,
  date: string,
  weekday: number,
  records: CongestionRecord[],
  settings: BaselineSettings,
): DailySummaryInput => {
  const counts = records
    .filter(record => {
      const hour = jstHour(record.windowStart.toMillis());
      return hour >= settings.operatingStartHour && hour < settings.operatingEndHour;
    })
    .map(record => record.uniqueDeviceCount)
    .sort((a, b) => a - b);

  return {
    location,
    date,
    weekday,
    slotCount: counts.length,
    dayMedian: counts.length === 0 ? null : medianOfSorted(counts),
    counts,
    operatingStartHour: settings.operatingStartHour,
    operatingEndHour: settings.operatingEndHour,
  };
};

// 設定の稼働時間帯が変わると、slotCountもdayMedianも意味が変わる。作り直しが要るかを返す。
export const isSummaryStale = (
  summary: { operatingStartHour: number; operatingEndHour: number },
  settings: BaselineSettings,
): boolean =>
  summary.operatingStartHour !== settings.operatingStartHour ||
  summary.operatingEndHour !== settings.operatingEndHour;
