import { Hono } from "hono";
import { z } from "zod";
import { getSensorDataHistory } from "../repositories/firestore";
import { MaxDeviceData } from "../repositories/firestore";
import { getLatestCongestionRecord } from "../repositories/firestore";
import { getMaxDevice } from "../repositories/firestore";


export const LocationQuerySchema = z.object({
  location: z.string().min(1, "location query parameter is required"),
});

export const HistoryQuerySchema = LocationQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(50).default(50),
});

const STALE_THRESHOLD_MS = 15 * 60 * 1000; // 5分ウィンドウ3回分。ウィンドウの確定と書き込み遅延を差し引いた実効マージンは約2回分

export const toLevel = (count: number, maxDevice: MaxDeviceData | null): number | null => {
  if (maxDevice === null) return null; // 基準値が未発行。キャリブレーション中として扱う
  return Math.min(9, Math.max(1, Math.ceil((count / maxDevice.baseline) * 9)));
};


export function calculateCongestionStatus(count: number): { level: string; label: string } {
  if (count >= 50) {
    return { level: "high", label: "混雑" };
  } else if (count >= 20) {
    return { level: "medium", label: "やや混雑" };
  } else {
    return { level: "low", label: "空いている" };
  }
}

export const congestionRoute = new Hono();


//関数化してコントローラー層から呼び出す形に変更
export const congestion = async (c: any) => {
  const parseResult = LocationQuerySchema.safeParse(await c.req.query());
  if (!parseResult.success) {
    return c.json({
      status: "error",
      message: parseResult.error.issues[0].message,
    }, 400);
  }

  const record = await getLatestCongestionRecord(parseResult.data.location);

  if (record === null) {
    return c.json({
      status: "error",
      message: "No data found",
    }, 404);
  }

  const isStale = Date.now() - record.windowStart.toMillis() > STALE_THRESHOLD_MS;
  const maxDevice = await getMaxDevice(record.location, record.weekday);
  const level = isStale ? null : toLevel(record.uniqueDeviceCount, maxDevice);

  return c.json({
    status: "success",
    data: {
      location: record.location,
      windowStart: record.windowStart.toDate().toISOString(),
      uniqueDeviceCount: record.uniqueDeviceCount,
      level,
      stale: isStale,
    }
  }, 200);
}


export const congestion_history = async (c: any) => {
  const parseResult = HistoryQuerySchema.safeParse(await c.req.query());
  if (!parseResult.success) {
    return c.json({
      status: "error",
      message: parseResult.error.issues[0].message,
    }, 400);
  }



  //ここで、リポジトリ層のgetSensorDataHistory関数を呼び出して、指定された場所のセンサーデータ履歴を取得します。
  const snapshot = await getSensorDataHistory(parseResult.data.location, parseResult.data.limit);

  if (snapshot.empty) {
    return c.json({
      status: "error",
      message: "No history data found",
    }, 404);
  }

  const history = snapshot.docs.map((doc: any) => {
    const data = doc.data();
    const congestionInfo = calculateCongestionStatus(data.ble_device_count);
    return {
      ...data,
      congestion_level: congestionInfo.level,
      congestion_label: congestionInfo.label,
    };
  }
  );

  return c.json({
    status: "success",
    count: history.length,
    data: history,
  }, 200);
}
