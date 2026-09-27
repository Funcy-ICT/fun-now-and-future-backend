import { z } from "zod";
import { Timestamp } from "firebase-admin/firestore";
import { ScanEventSchema } from "./scan_event";

// Pub/Subのメッセージ(ScanEvent)をpending_scansに保存した形。受信時刻はTimestampにして、窓の範囲で検索できるようにする。
export const PendingScanEventSchema = ScanEventSchema.omit({ receivedAt: true }).extend({
  received_at: z.instanceof(Timestamp),
});
export type PendingScanEvent = z.infer<typeof PendingScanEventSchema>;
