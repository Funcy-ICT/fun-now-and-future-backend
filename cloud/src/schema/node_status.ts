import { z } from "zod";
import { Timestamp } from "firebase-admin/firestore";

// ノードごと・5分窓ごとの受信件数。ノードが生きているかの確認に使う
export const NodeStatusSchema = z.object({
  nodeId: z.string().min(1, "nodeId is required"),
  location: z.string().min(1, "location is required"),
  windowStart: z.instanceof(Timestamp),
  postCount: z.number().min(0, "postCount must be at least 0"),
  totalMacCount: z.number().min(0, "totalMacCount must be at least 0"),
});

export type NodeStatusData = z.infer<typeof NodeStatusSchema>;
