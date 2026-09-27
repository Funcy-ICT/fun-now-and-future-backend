import { BigQuery } from "@google-cloud/bigquery";

// データセットは作成後にリージョンを変えられないので、他のサービスと同じ東京に置く
export const BIGQUERY_LOCATION = "asia-northeast1";

// 1回のクエリで課金される上限。誤った範囲を指定しても、上限を超えるクエリは実行されずに失敗する
const DEFAULT_MAX_BYTES_BILLED = 5 * 1024 ** 3;

let client: BigQuery | undefined;

// 呼ばれるまでクライアントを作らない。BigQueryを使わないテストやローカルで、gcpの認証を要求しないため。
export const getBigQuery = (): BigQuery => {
  client ??= new BigQuery({
    projectId: process.env.GCLOUD_PROJECT ?? "fun-now-and-future",
    location: BIGQUERY_LOCATION,
  });
  return client;
};

// テストでは、環境変数BQ_DATASETでテスト用のデータセットに切り替える
export const getScanEventsTableId = (): string => {
  const project = process.env.GCLOUD_PROJECT ?? "fun-now-and-future";
  const dataset = process.env.BQ_DATASET ?? "fnaf_analytics";
  return `${project}.${dataset}.scan_events`;
};

export const getMaxBytesBilled = (): number => {
  const value = Number(process.env.BQ_MAX_BYTES_BILLED);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_MAX_BYTES_BILLED;
};
