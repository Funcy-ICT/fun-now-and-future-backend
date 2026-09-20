import { randomUUID } from "crypto";
import { z } from "zod";
import { parseRawData } from "./parseRawData";
import { Device } from "../schema/sensor_data";
import { ParsedDevice } from "../schema/sensor_data";
import { ParsedSensorData } from "../schema/sensor_data";
import { NodeStatusData } from "../repositories/firestore";
import { Timestamp } from "firebase-admin/firestore";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export const jstWeekday = (ms: number): number =>
  new Date(ms + JST_OFFSET_MS).getUTCDay();


export const normalizeDevice = (device: Device): ParsedDevice => {
  switch (device.format) {
    case "parsed":
      return device;
    case "raw": {
      const { companyId, isNearbyInfo } = parseRawData(device.rawData);
      return {
        mac: device.mac,
        rssi: device.rssi,
        format: "parsed",
        companyId,
        isNearbyInfo,
      };
    }
  }
};


export type DedupedDevice = {
  device: ParsedDevice;
  uuid: string;
  count: number;
};

export const dedupeByMac = (devices: ParsedDevice[]): DedupedDevice[] => {
  const macToUuid = new Map<string, string>(); // この呼び出し(=1回の集計run)限りの対応表。実際のmacは戻り値に含めない
  const bestByUuid = new Map<string, DedupedDevice>();

  for (const device of devices) {
    let uuid = macToUuid.get(device.mac);
    if (uuid === undefined) {
      uuid = randomUUID();
      macToUuid.set(device.mac, uuid);
    }

    const current = bestByUuid.get(uuid);
    if (current === undefined) {
      bestByUuid.set(uuid, { device, uuid, count: 1 });
    } else {
      current.count += 1;
      if (device.rssi > current.device.rssi) current.device = device;
    }
  }

  return [...bestByUuid.values()];
};

export const groupByLocation = (
  scans: ParsedSensorData[],
): Map<string, ParsedDevice[]> => {
  const byLocation = new Map<string, ParsedDevice[]>();

  for (const scan of scans) {
    const devices = byLocation.get(scan.location) ?? [];
    devices.push(...scan.devices);
    byLocation.set(scan.location, devices);
  }

  return byLocation;
};

export type NodeHealthStat = {
  nodeId: string;
  location: string;
  postCount: number;
  totalMacCount: number;
};

export const aggregateNodeHealth = (
  scans: { nodeId: string; location: string; devices: unknown[] }[],
  windowStart: Timestamp,
): NodeStatusData[] => {
  const byNode = new Map<string, NodeStatusData>();

  for (const scan of scans) {
    const current = byNode.get(scan.nodeId);
    if (current === undefined) {
      byNode.set(scan.nodeId, {
        nodeId: scan.nodeId,
        location: scan.location,
        windowStart,
        postCount: 1,
        totalMacCount: scan.devices.length,
      });
    } else {
      current.postCount += 1;
      current.totalMacCount += scan.devices.length;
    }
  }

  return [...byNode.values()];
};

const WINDOW_MS = 5 * 60 * 1000;

export const previousWindowStart = (date: Date): Timestamp => {
  const currentWindowStartMs = Math.floor(date.getTime() / WINDOW_MS) * WINDOW_MS;
  const previousWindowStartMs = currentWindowStartMs - WINDOW_MS;
  return Timestamp.fromMillis(previousWindowStartMs);
};

// pub/sub経由でfirestoreに書かれるまでの遅れを待つ猶予。Cloud Schedulerは分単位のcronなので、窓が閉じた1分後に呼ぶ(1-59/5 * * * *)。
export const AGGREGATE_GRACE_MS = 60 * 1000;

// 窓に間に合わず遅れて届いたデータを消すまでの時間
export const STALE_PENDING_SCAN_MS = 24 * 60 * 60 * 1000;

// 集計する窓[start, end)。猶予の分だけ現在時刻を戻してから、1つ前の窓を求める。
// 猶予より早く呼ばれても、閉じてから猶予が過ぎた窓だけが対象になる。
export const aggregateWindow = (now: Date): { start: Timestamp; end: Timestamp } => {
  const start = previousWindowStart(new Date(now.getTime() - AGGREGATE_GRACE_MS));
  return { start, end: Timestamp.fromMillis(start.toMillis() + WINDOW_MS) };
};

export const filterByRssi = (
  devices: ParsedDevice[],
  minRssi: number
): ParsedDevice[] => {
  return devices.filter(device => device.rssi >= minRssi);
}

export const StageConfigSchema = z.discriminatedUnion("name", [
  z.object({ name: z.literal("dedupe") }),
  z.object({
    name: z.literal("companyFilter"),
    allowedCompanyIds: z.array(z.string()),
    requireNearbyInfo: z.boolean(),
  }),
  z.object({
    name: z.literal("rssiFilter"),
    rssiThreshold: z.number(),
  }),
]);
export type StageConfig = z.infer<typeof StageConfigSchema>;

type StageFn = (devices: ParsedDevice[], config: StageConfig) => ParsedDevice[];

export const STAGE_REGISTRY: Record<string, StageFn> = {
  dedupe: (devices) => dedupeByMac(devices).map(d => d.device),

  companyFilter: (devices, config) => {
    if (config.name !== "companyFilter") return devices; // 型ガード。実際には呼ばれない
    return devices.filter(d =>
      config.allowedCompanyIds.includes(d.companyId ?? "") &&
      (!config.requireNearbyInfo || d.isNearbyInfo)
    );
  },

  rssiFilter: (devices, config) => {
    if (config.name !== "rssiFilter") return devices;
    return filterByRssi(devices, config.rssiThreshold);
  },
};

export type StageTraceEntry = {
  stageName: string;
  countBefore: number;
  countAfter: number;
};

export type PipelineResult = {
  result: ParsedDevice[];
  trace: StageTraceEntry[];
  dedupeOutput?: DedupedDevice[]; // dedupe段が実行された場合のみ値が入る
};

export const runPipeline = (devices: ParsedDevice[], stages: StageConfig[]): PipelineResult => {
  const trace: StageTraceEntry[] = [];
  let current = devices;
  let dedupeOutput: DedupedDevice[] | undefined;

  for (const stage of stages) {
    const before = current.length;

    if (stage.name === "dedupe") {
      const deduped = dedupeByMac(current);
      dedupeOutput = deduped;
      current = deduped.map(d => d.device);
    } else {
      current = STAGE_REGISTRY[stage.name](current, stage);
    }

    trace.push({ stageName: stage.name, countBefore: before, countAfter: current.length });
  }

  return { result: current, trace, dedupeOutput };
};