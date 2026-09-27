import { z } from "zod";

// 1回の/aggregateの結果。BigQueryに履歴として残し、台数の推移やフィルタごとの除外数の分析に使う。
// 項目名・型・NULL許容は cloud/bigquery/aggregate_runs.schema.json と一致させる(aggregate_run_schema.test.tsで検証)。

const StageTraceEntrySchema = z.object({
  stageName: z.string().min(1),
  countBefore: z.number().int().nonnegative(),
  countAfter: z.number().int().nonnegative(),
});

const AggregateRunLocationSchema = z.object({
  location: z.string().min(1),
  weekday: z.number().int().min(0).max(6), // JST基準
  uniqueDeviceCount: z.number().int().nonnegative(),
  stageTrace: z.array(StageTraceEntrySchema),
});

const AggregateRunNodeSchema = z.object({
  nodeId: z.string().min(1),
  location: z.string().min(1),
  postCount: z.number().int().nonnegative(),
  totalMacCount: z.number().int().nonnegative(),
});

export const AggregateRunSchema = z.object({
  windowStart: z.iso.datetime(),
  computedAt: z.iso.datetime(), // 集計を実行した時刻。窓との差から、遅れを見る
  configHash: z.string().min(1),
  stagesJson: z.string().min(1), // そのとき使ったフィルタの設定。設定のバージョン管理を作らずに済ませるため、中身をそのまま残す
  locations: z.array(AggregateRunLocationSchema),
  nodes: z.array(AggregateRunNodeSchema),
});

export type AggregateRun = z.infer<typeof AggregateRunSchema>;
