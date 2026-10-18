import { z } from "zod";

// フィルタの段の設定。段の順番どおりに通す(runPipeline, 分析用のSQL)
export const StageConfigSchema = z.discriminatedUnion("name", [
  z.object({ name: z.literal("dedupe") }),
  z.object({
    name: z.literal("companyFilter"),
    allowedCompanyIds: z.array(z.string()),
    requireNearbyInfo: z.boolean(),
  }),
  z.object({
    name: z.literal("rssiFilter"),
    rssiThreshold: z.number(), // nodeThresholdsに無いノードに使う
    // location → nodeId → 閾値。ノードを別の場所に移したら、前の場所の閾値を使わないよう、locationとの組にする。
    // 既定値({})は付けない。付けると、同じ設定でもconfigHashが変わるため。分析用のSQLは、まだこの閾値で判定していない
    nodeThresholds: z.record(z.string().min(1), z.record(z.string().min(1), z.number())).optional(),
  }),
]);
export type StageConfig = z.infer<typeof StageConfigSchema>;

// config/filter_pipeline。Web UIまたはFirestoreコンソールから段の順番と値を変える
export const FilterPipelineConfigSchema = z.object({
  stages: z.array(StageConfigSchema),
  debugModeEnabled: z.boolean(),
});
export type FilterPipelineConfig = z.infer<typeof FilterPipelineConfigSchema>;
