import { StageConfig } from "./scan_service";

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
