import { getScanEventsTableId } from "../lib/bigquery";
import { runDdl } from "../repositories/bigquery";
import { getRetentionConfig, saveRetentionConfig } from "../repositories/firestore";
import { MAX_RETENTION_DAYS, MIN_RETENTION_DAYS, RetentionConfig, RetentionInput } from "../schema/retention";

const TABLE_ID_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_]+\.[A-Za-z0-9_]+$/; // project.dataset.table

// テーブル名と日数はクエリパラメータにできないので、形式を確かめてから埋め込む。
// パーティションの有効期限を過ぎたデータは削除されるので、日数の範囲もここで止める。
export const buildPartitionExpirationDdl = (tableId: string, days: number | null): string => {
  if (!TABLE_ID_PATTERN.test(tableId)) {
    throw new Error("Invalid table id");
  }
  if (days !== null && (!Number.isInteger(days) || days < MIN_RETENTION_DAYS || days > MAX_RETENTION_DAYS)) {
    throw new Error("Invalid retention days");
  }
  return `ALTER TABLE \`${tableId}\` SET OPTIONS (partition_expiration_days = ${days === null ? "NULL" : days})`;
};

// BigQueryに適用してから、Firestoreに保存する。順序を逆にすると、設定は変わったのに実際の保持期間が変わらない状態になる。
export const updateRetention = async (input: RetentionInput, updatedBy: string | null): Promise<void> => {
  await runDdl(buildPartitionExpirationDdl(getScanEventsTableId(), input.scanEventsDays));
  await saveRetentionConfig(input, updatedBy);
};

// 設定が無ければnullを返す。画面では「未設定(無期限)」として扱う。
export const getRetention = async (): Promise<RetentionConfig | null> => getRetentionConfig();
