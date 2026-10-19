import { z } from "zod";
import { Timestamp } from "firebase-admin/firestore";

// フィルタ通過状況の診断データ。config/diagnosticsがtrueのときだけ書く
export const ScanDiagnosticsSchema = z.object({
  location: z.string().min(1),
  weekday: z.number().int().min(0).max(6),
  windowStart: z.instanceof(Timestamp),
  stageTrace: z.array(z.object({
    stageName: z.string(),
    countBefore: z.number().int().nonnegative(),
    countAfter: z.number().int().nonnegative(),
  })),
  devices: z.array(z.object({
    uuid: z.string(), // 実際のmacアドレスではない。dedupeByMacが発行する使い捨てUUID
    rssi: z.number(),
    companyId: z.string().nullable(),
    isNearbyInfo: z.boolean(),
    count: z.number().int().positive(),
    // 検出したノードとrssi。ノードごとの閾値を変えたときの台数を確かめるため。前の形のドキュメントには無い
    detections: z.array(z.object({ nodeId: z.string(), rssi: z.number() })).optional(),
  })),
});
export type ScanDiagnostics = z.infer<typeof ScanDiagnosticsSchema>;
