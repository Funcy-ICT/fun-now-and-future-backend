import { StageConfig } from "../schema/filter_pipeline";

// BigQueryのクエリパラメータ。値と型を別に持つ。空の配列は型を推定できないため、型は必ず指定する。
export type QueryParams = {
  params: Record<string, unknown>;
  types: Record<string, string | string[]>;
};

export type StageCte = QueryParams & { body: string };

// フィルタの1段を、1つ前の段(from)を読むCTEの中身にする。値はクエリパラメータで渡し、SQLに埋め込まない。
// TSの実装(STAGE_REGISTRY, dedupeByMac)と同じ結果になるようにする。食い違いはparityのテストで確かめる。
export const buildStageCte = (stage: StageConfig, index: number, from: string): StageCte => {
  const p = `s${index}_`;
  switch (stage.name) {
    case "dedupe":
      // 窓とlocationごとに、同じmacのうちrssiが最も強い行だけを残す。companyIdなどは、その行の値になる
      return {
        body: `SELECT * FROM ${from} WHERE TRUE
  QUALIFY ROW_NUMBER() OVER (PARTITION BY windowStart, location, macHash ORDER BY rssi DESC) = 1`,
        params: {},
        types: {},
      };
    case "companyFilter":
      // TSではcompanyIdがnullなら空文字として比べ、isNearbyInfoがnullならfalseとして扱う
      return {
        body: `SELECT * FROM ${from}
  WHERE IFNULL(companyId, '') IN UNNEST(@${p}allowedCompanyIds)
    AND (NOT @${p}requireNearbyInfo OR IFNULL(isNearbyInfo, FALSE))`,
        params: {
          [`${p}allowedCompanyIds`]: stage.allowedCompanyIds,
          [`${p}requireNearbyInfo`]: stage.requireNearbyInfo,
        },
        types: {
          [`${p}allowedCompanyIds`]: ["STRING"],
          [`${p}requireNearbyInfo`]: "BOOL",
        },
      };
    case "rssiFilter":
      return {
        body: `SELECT * FROM ${from}
  WHERE rssi >= @${p}rssiThreshold`,
        params: { [`${p}rssiThreshold`]: stage.rssiThreshold },
        types: { [`${p}rssiThreshold`]: "FLOAT64" },
      };
  }
};

const TABLE_ID_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_]+\.[A-Za-z0-9_]+$/; // project.dataset.table

export type AnalysisQueryInput = {
  tableId: string;
  stages: StageConfig[];
  start: Date;
  end: Date;
  locations?: string[];
};

export type AnalysisQuery = QueryParams & { query: string };

// 受信時刻の5分窓とlocationごとに、各段を通ったあとの台数を数えるクエリを組み立てる。
// 1行が(窓, location, 段の番号)で、段の番号0はフィルタを通す前の件数。
// メッセージが届いたが検出が0件の窓は0として返し、メッセージが届いていない窓は返さない(欠測と区別するため)。
export const buildAnalysisQuery = (input: AnalysisQueryInput): AnalysisQuery => {
  // テーブル名はクエリパラメータにできないので、形式を確かめてから埋め込む
  if (!TABLE_ID_PATTERN.test(input.tableId)) {
    throw new Error("Invalid table id");
  }
  if (input.start.getTime() >= input.end.getTime()) {
    throw new Error("start must be before end");
  }

  const params: Record<string, unknown> = {
    start: input.start.toISOString(),
    end: input.end.toISOString(),
  };
  const types: Record<string, string | string[]> = { start: "TIMESTAMP", end: "TIMESTAMP" };

  let locationFilter = "";
  if (input.locations !== undefined) {
    locationFilter = "\n    AND location IN UNNEST(@locations)";
    params.locations = input.locations;
    types.locations = ["STRING"];
  }

  const stageCtes = input.stages.map((stage, i) => {
    const cte = buildStageCte(stage, i + 1, `s${i}`);
    Object.assign(params, cte.params);
    Object.assign(types, cte.types);
    return `s${i + 1} AS (\n  ${cte.body}\n)`;
  });

  const counts = Array.from({ length: input.stages.length + 1 }, (_, i) =>
    `  SELECT windowStart, location, ${i} AS stageIndex, COUNT(*) AS deviceCount FROM s${i} GROUP BY windowStart, location`,
  ).join("\n  UNION ALL\n");

  // receivedAtで範囲を絞ると、パーティションの指定になり、読む量が減る。
  // 同じ送信が2回以上書き込まれていても1回として数える(esp32の再送はsendId、pub/subの再配信はmessage_idで見分ける)。
  const query = `WITH messages AS (
  SELECT
    *,
    TIMESTAMP_SECONDS(DIV(UNIX_SECONDS(receivedAt), 300) * 300) AS windowStart
  FROM \`${input.tableId}\`
  WHERE receivedAt >= @start AND receivedAt < @end${locationFilter}
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY IF(sendId IS NOT NULL, CONCAT(nodeId, '/', sendId), IFNULL(message_id, CONCAT(nodeId, '@', CAST(UNIX_MICROS(receivedAt) AS STRING))))
    ORDER BY receivedAt
  ) = 1
),
windows AS (
  SELECT DISTINCT windowStart, location FROM messages
),
s0 AS (
  SELECT m.windowStart, m.location, d.macHash, d.rssi, d.companyId, d.isNearbyInfo
  FROM messages AS m, UNNEST(m.devices) AS d
),
${stageCtes.map(cte => `${cte},\n`).join("")}counts AS (
${counts}
)
SELECT
  w.windowStart,
  w.location,
  EXTRACT(DAYOFWEEK FROM w.windowStart AT TIME ZONE 'Asia/Tokyo') - 1 AS weekday,
  i AS stageIndex,
  IFNULL(c.deviceCount, 0) AS deviceCount
FROM windows AS w
CROSS JOIN UNNEST(GENERATE_ARRAY(0, ${input.stages.length})) AS i
LEFT JOIN counts AS c
  ON c.windowStart = w.windowStart AND c.location = w.location AND c.stageIndex = i
ORDER BY w.windowStart, w.location, i`;

  return { query, params, types };
};
