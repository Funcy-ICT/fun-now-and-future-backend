import { MaxDeviceData } from "../repositories/firestore";
import { getLatestCongestionRecord } from "../repositories/firestore";
import { getCongestionRecordHistory } from "../repositories/firestore";
import { getMaxDevice } from "../repositories/firestore";

const STALE_THRESHOLD_MS = 15 * 60 * 1000; // 5分ウィンドウ3回分。ウィンドウの確定と書き込み遅延を差し引いた実効マージンは約2回分

export const toLevel = (count: number, maxDevice: MaxDeviceData | null): number | null => {
  if (maxDevice === null) return null; // 基準値が未発行。キャリブレーション中として扱う
  return Math.min(9, Math.max(1, Math.ceil((count / maxDevice.baseline) * 9)));
};

export type CongestionStatus = {
  location: string;
  windowStart: string;
  uniqueDeviceCount: number;
  level: number | null;
  stale: boolean;
};

export const getCongestionStatus = async (location: string): Promise<CongestionStatus | null> => {
  const record = await getLatestCongestionRecord(location);
  if (record === null) return null;

  const isStale = Date.now() - record.windowStart.toMillis() > STALE_THRESHOLD_MS;
  const maxDevice = await getMaxDevice(record.location, record.weekday);
  const level = isStale ? null : toLevel(record.uniqueDeviceCount, maxDevice);

  return {
    location: record.location,
    windowStart: record.windowStart.toDate().toISOString(),
    uniqueDeviceCount: record.uniqueDeviceCount,
    level,
    stale: isStale,
  };
};

export type CongestionHistoryEntry = {
  location: string;
  windowStart: string;
  uniqueDeviceCount: number;
  level: number | null;
};

export const getCongestionHistoryStatus = async (location: string, limit: number): Promise<CongestionHistoryEntry[]> => {
  const records = await getCongestionRecordHistory(location, limit);

  // 履歴が複数曜日にまたがる場合に備えて、必要になったweekdayのmax_devicesだけをキャッシュする
  const maxDeviceCache = new Map<number, MaxDeviceData | null>();
  const history: CongestionHistoryEntry[] = [];
  for (const record of records) {
    if (!maxDeviceCache.has(record.weekday)) {
      maxDeviceCache.set(record.weekday, await getMaxDevice(record.location, record.weekday));
    }
    history.push({
      location: record.location,
      windowStart: record.windowStart.toDate().toISOString(),
      uniqueDeviceCount: record.uniqueDeviceCount,
      level: toLevel(record.uniqueDeviceCount, maxDeviceCache.get(record.weekday)!),
    });
  }
  return history;
};
