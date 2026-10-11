import { z } from "zod";
import { Timestamp } from "firebase-admin/firestore";

// 管理画面から変える設定のドキュメント(config/{name})
export const CONFIG_NAMES = ["filter_pipeline", "baseline", "retention", "nodes"] as const;
export type ConfigName = (typeof CONFIG_NAMES)[number];

// 設定のドキュメントに、値と同じ階層で置く項目。読む側のスキーマ(z.object)は知らない項目を無視するので、今の読み出しは変わらない。
// versionが無いドキュメント(コンソールで作ったもの)は、0とみなす
export const ConfigMetaSchema = z.object({
  version: z.number().int().nonnegative(),
  updatedAt: z.instanceof(Timestamp),
  updatedBy: z.string().nullable(), // 認証が入るまではnull
});
export type ConfigMeta = z.infer<typeof ConfigMetaSchema>;

// config_history/{name}__{version}。設定を保存するたびに1件足す。
// 段の種類やパラメータは後から変わるので、前後の値の中身は検証せず、保存したときの形のまま残す
export const ConfigHistorySchema = z.object({
  name: z.enum(CONFIG_NAMES),
  version: z.number().int().positive(),
  before: z.record(z.string(), z.unknown()).nullable(), // ドキュメントが無かったときはnull
  after: z.record(z.string(), z.unknown()),
  updatedAt: z.instanceof(Timestamp),
  updatedBy: z.string().nullable(),
  configHash: z.string().optional(), // filter_pipelineのときだけ。congestion_recordsのconfigHashと突き合わせる
});
export type ConfigHistory = z.infer<typeof ConfigHistorySchema>;

// 保存しようとしたときに、別の保存が先に入っていた。管理画面には409で返す
export class ConfigVersionConflictError extends Error {
  constructor(readonly currentVersion: number) {
    super(`Config version conflict: current version is ${currentVersion}`);
    this.name = "ConfigVersionConflictError";
  }
}
