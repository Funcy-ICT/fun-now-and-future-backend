// .openapi() で swagger に出す名前を付けるため、z は @hono/zod-openapi から読む(zod を拡張した同じもの)
import { z } from "@hono/zod-openapi";

// 管理画面から受け取る設定の形。打ち間違いを保存の時点で止めるため、読む側のスキーマより厳しくする

const rssi = z.number().int().min(-127).max(0); // BLEのRSSIの範囲

const StageInputSchema = z.discriminatedUnion("name", [
  z.strictObject({ name: z.literal("dedupe") }),
  z.strictObject({
    name: z.literal("companyFilter"),
    // parseRawDataが作る形(大文字の16進4桁)。小文字などで入れると、一致する端末が無くなり、何も言わずに0台になる
    allowedCompanyIds: z.array(z.string().regex(/^[0-9A-F]{4}$/, "companyId must be 4 uppercase hex digits")),
    requireNearbyInfo: z.boolean(),
  }),
  z.strictObject({
    name: z.literal("rssiFilter"),
    rssiThreshold: rssi,
    nodeThresholds: z.record(z.string().min(1), z.record(z.string().min(1), rssi)).optional(),
  }),
]);
export type StageInput = z.infer<typeof StageInputSchema>;

const countNodeThresholds = (stage: StageInput): number =>
  stage.name === "rssiFilter"
    ? Object.values(stage.nodeThresholds ?? {}).reduce((sum, nodes) => sum + Object.keys(nodes).length, 0)
    : 0;

// debugModeEnabledは受け取らない。画面に出さない項目なので、サーバーが今の値を引き継ぐ
export const FilterPipelineInputSchema = z.strictObject({
  stages: z.array(StageInputSchema),
}).superRefine(({ stages }, ctx) => {
  const names = stages.map(stage => stage.name);
  if (new Set(names).size !== names.length) {
    ctx.addIssue({ code: "custom", message: "each stage can appear only once" });
  }
  // 重複排除が無いと、ノードが窓の中で送るたびに同じ端末を数える。診断データにどの段も通す前の端末を残すため、先頭に置く
  if (names[0] !== "dedupe") {
    ctx.addIssue({ code: "custom", message: "dedupe must be the first stage" });
  }
  // ノードごとの閾値の判定は、TSとSQLの両方に入るまで使えない。保存しても集計に使われないため、拒否する
  if (stages.some(stage => countNodeThresholds(stage) > 0)) {
    ctx.addIssue({ code: "custom", message: "nodeThresholds is not supported yet" });
  }
});
export type FilterPipelineInput = z.infer<typeof FilterPipelineInputSchema>;
