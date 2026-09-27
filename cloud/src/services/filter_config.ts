import { createHash } from "crypto";
import { StageConfig } from "../schema/filter_pipeline";

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
