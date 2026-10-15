import { createHash } from "crypto";
import { StageConfig } from "../schema/filter_pipeline";
import { FilterPipelineInput, StageInput } from "../schema/api/admin_config";
import { StoredConfig } from "../schema/config_meta";
import { readFilterPipelineConfig, updateConfigWithHistory } from "../repositories/firestore";

// キーの順序が違うだけで別のハッシュにならないよう、オブジェクトのキーを名前順に並べ替える。
// 段の順序は最終的な台数を変えるので、配列の順序はそのまま保つ。
const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== "object") return value;

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => [key, canonicalize(v)] as const);
  return Object.fromEntries(entries);
};

// 集計結果の履歴に、そのとき使ったフィルタの設定を残すための文字列。
export const stagesToJson = (stages: StageConfig[]): string => JSON.stringify(canonicalize(stages));

// 集計結果が、どの設定で数えた値かを見分けるための値。
export const hashStages = (stages: StageConfig[]): string =>
  createHash("sha256").update(stagesToJson(stages)).digest("hex");

// 保存する段。空のnodeThresholdsは項目ごと消す。入れたままだと、同じ設定でもconfigHashが変わるため
const toStoredStages = (stages: StageInput[]): StageConfig[] =>
  stages.map(stage => {
    if (stage.name !== "rssiFilter" || stage.nodeThresholds === undefined) return stage;
    const hasThreshold = Object.values(stage.nodeThresholds).some(nodes => Object.keys(nodes).length > 0);
    if (hasThreshold) return stage;
    const { nodeThresholds: _empty, ...rest } = stage;
    return rest;
  });

// 管理画面からの保存。inputはFilterPipelineInputSchemaで検証したもの。
// debugModeEnabledは画面から受け取らないので、今の値を引き継ぐ。versionが食い違えばConfigVersionConflictErrorを投げる
export const saveFilterPipelineConfig = async (
  input: FilterPipelineInput,
  expectedVersion: number,
  updatedBy: string | null,
): Promise<number> => {
  const stages = toStoredStages(input.stages);
  return updateConfigWithHistory(
    "filter_pipeline",
    expectedVersion,
    (current) => ({ stages, debugModeEnabled: current?.debugModeEnabled === true }),
    updatedBy,
    hashStages(stages),
  );
};

// 管理画面に返す。debugModeEnabledは画面に出さないので返さない
export const getFilterPipeline = async (): Promise<
  StoredConfig<{ stages: StageConfig[] }> & { source: "stored" | "default"; configHash: string }
> => {
  const { value, ...rest } = await readFilterPipelineConfig();
  return { ...rest, value: { stages: value.stages }, configHash: hashStages(value.stages) };
};
