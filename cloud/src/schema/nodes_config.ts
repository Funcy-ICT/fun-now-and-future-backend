import { z } from "zod";

// config/nodes。ノードの運用のための設定で、台数には影響しない。キーはnodeId
export const NodeSettingsSchema = z.object({
  displayName: z.string().min(1).max(40).optional(), // 管理画面に出す名前
  retired: z.boolean().optional(), // 撤去済み。trueなら停止の判定と通知から外す
});

export const NodesConfigSchema = z.object({
  nodes: z.record(z.string().min(1), NodeSettingsSchema),
});
export type NodesConfig = z.infer<typeof NodesConfigSchema>;

// 管理画面から受け取る形。打ち間違いを保存の時点で止めるため、知らない項目は弾く
export const NodesConfigInputSchema = z.strictObject({
  nodes: z.record(z.string().min(1), z.strictObject(NodeSettingsSchema.shape)),
});
export type NodesConfigInput = z.infer<typeof NodesConfigInputSchema>;
