import { z } from "zod";
import { Timestamp } from "firebase-admin/firestore";

// status/node_last_seen。一度でも送ってきたノードの、最終受信時刻と状態。/aggregateだけが書く。
// ノードは事前に登録しないので、止まったノードを見つけるには、来るはずのノードをここで覚えておく
export const NodeLastSeenEntrySchema = z.object({
  location: z.string().min(1),
  lastSeenAt: z.instanceof(Timestamp), // 最後に受信があった窓のwindowStart
  state: z.enum(["up", "down"]),
  stateChangedAt: z.instanceof(Timestamp),
});
export type NodeLastSeenEntry = z.infer<typeof NodeLastSeenEntrySchema>;

export const NodeLastSeenSchema = z.object({
  nodes: z.record(z.string().min(1), NodeLastSeenEntrySchema), // キーはnodeId
});
export type NodeLastSeen = z.infer<typeof NodeLastSeenSchema>;
