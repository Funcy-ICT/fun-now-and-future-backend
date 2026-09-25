import { MAX_RETENTION_DAYS, MIN_RETENTION_DAYS } from "../schema/retention";

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
