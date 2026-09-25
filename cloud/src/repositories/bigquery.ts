import { getBigQuery, getMaxBytesBilled, BIGQUERY_LOCATION } from "../lib/bigquery";
import { AnalysisQuery } from "../services/analysis_sql";

// 課金の上限を必ず付けて実行する。上限を超えるクエリは、実行されずに失敗する。
export const runQuery = async (query: AnalysisQuery): Promise<unknown[]> => {
  const [rows] = await getBigQuery().query({
    query: query.query,
    params: query.params,
    types: query.types,
    location: BIGQUERY_LOCATION,
    maximumBytesBilled: String(getMaxBytesBilled()),
    useLegacySql: false,
  });
  return rows;
};
