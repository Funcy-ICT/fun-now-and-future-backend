import { z } from "zod";

// 基準値の計算に使う設定。値はFirestoreのconfig/baselineから読み、無ければこの既定値を使う。
// 既定値はissue #24の定数。locationごとに上書きできるのは、センサーが夜間に止まるなど、稼働時間帯がlocationで違うため。
export const DEFAULT_BASELINE_SETTINGS = {
  operatingStartHour: 7,
  operatingEndHour: 22,
  completenessRatio: 0.8, // 稼働時間帯の窓のうち、記録がある割合の下限。ノード停止を弾く
  gateRatio: 0.5,         // refMedianに対する、その日の中央値の割合の下限。休業日を弾く
  refMedianWeeks: 26,     // refMedianを作る期間。最長の休業が少数派に収まる長さ
  targetDays: 4,          // 集める有効日数
  maxLookbackWeeks: 12,   // 遡りの上限
  percentile: 0.95,
} as const;

export type BaselineSettings = { [K in keyof typeof DEFAULT_BASELINE_SETTINGS]: number };

// 9段階が成立する最小条件なので、設定にしない(issue #24 Decision 6)
export const MIN_BASELINE = 9;

const hour = z.number().int().min(0).max(24);
const ratio = z.number().gt(0).max(1);

// コンソールから手で入れる前提なので、項目ごとに範囲を確かめる
export const BaselineSettingsPatchSchema = z.object({
  operatingStartHour: hour,
  operatingEndHour: hour,
  completenessRatio: ratio,
  gateRatio: ratio,
  refMedianWeeks: z.number().int().min(1).max(104),
  targetDays: z.number().int().min(1).max(30),
  maxLookbackWeeks: z.number().int().min(1).max(104),
  percentile: z.number().gt(0.5).lt(1),
}).partial();

export type BaselineSettingsPatch = z.infer<typeof BaselineSettingsPatchSchema>;

export const BaselineConfigSchema = z.object({
  defaults: BaselineSettingsPatchSchema.optional(),
  locations: z.record(z.string(), BaselineSettingsPatchSchema).optional(),
});

export type BaselineConfig = z.infer<typeof BaselineConfigSchema>;
