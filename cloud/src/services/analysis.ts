import { z } from "zod";
import { StageTraceEntry } from "./scan_service";
import { StageConfig } from "../schema/filter_pipeline";
import { buildAnalysisQuery } from "./analysis_sql";
import { runQuery } from "../repositories/bigquery";
import { getScanEventsTableId } from "../lib/bigquery";

// buildAnalysisQueryの結果の1行。TIMESTAMPはクライアントによって{ value }の形で返る
const AnalysisRowSchema = z.object({
  windowStart: z.union([z.string(), z.object({ value: z.string() })]),
  location: z.string(),
  weekday: z.coerce.number().int(),
  stageIndex: z.coerce.number().int().nonnegative(),
  deviceCount: z.coerce.number().int().nonnegative(),
});

export type WindowResult = {
  windowStart: string;
  location: string;
  weekday: number;
  uniqueDeviceCount: number;
  stageTrace: StageTraceEntry[];
};

// (窓, location, 段の番号)ごとの行を、窓とlocationごとにまとめ、/aggregateのstageTraceと同じ形にする。
export const toWindowResults = (rows: unknown[], stages: StageConfig[]): WindowResult[] => {
  const byKey = new Map<string, { windowStart: string; location: string; weekday: number; counts: number[] }>();

  for (const raw of rows) {
    const row = AnalysisRowSchema.parse(raw);
    const windowStart = new Date(typeof row.windowStart === "string" ? row.windowStart : row.windowStart.value).toISOString();
    const key = `${windowStart}__${row.location}`;

    let entry = byKey.get(key);
    if (entry === undefined) {
      entry = { windowStart, location: row.location, weekday: row.weekday, counts: Array(stages.length + 1).fill(0) };
      byKey.set(key, entry);
    }
    entry.counts[row.stageIndex] = row.deviceCount;
  }

  return [...byKey.values()].map(({ counts, ...rest }) => ({
    ...rest,
    uniqueDeviceCount: counts[stages.length],
    stageTrace: stages.map((stage, i) => ({ stageName: stage.name, countBefore: counts[i], countAfter: counts[i + 1] })),
  }));
};

// 生データから、指定した設定で窓とlocationごとの台数を数え直す。分析画面と、設定変更時の再計算で使う。
export const countDevicesByWindow = async (input: {
  stages: StageConfig[];
  start: Date;
  end: Date;
  locations?: string[];
}): Promise<WindowResult[]> => {
  const query = buildAnalysisQuery({ ...input, tableId: getScanEventsTableId() });
  const rows = await runQuery(query);
  return toWindowResults(rows, input.stages);
};
