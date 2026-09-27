import { z } from "zod";

// public以外は、macの最上位ビットからの推定値(inferAddressType)。publicはesp32がアドレス種別を送れるようになってから使う。
export const ADDRESS_TYPES = ["public", "random_static", "random_resolvable", "random_non_resolvable"] as const;
export type AddressType = (typeof ADDRESS_TYPES)[number];

// Pub/Subに流すメッセージ。BigQueryサブスクリプションが同じJSONをテーブルの列に対応づけて書き込むため、
// 項目名・型・NULL許容は cloud/bigquery/scan_events.schema.json と一致させる(scan_event_schema.test.tsで検証)。
export const ScanEventDeviceSchema = z.object({
  macHash: z.string().min(1), // 正規化したmacのHMAC。生のmacは含めない
  rssi: z.number().int(),
  format: z.enum(["raw", "parsed"]),
  rawData: z.string().nullable(), // parsed(LoRa)では無い
  companyId: z.string().nullable(),
  isNearbyInfo: z.boolean().nullable(), // parsedで送られない場合はnull
  addressType: z.enum(ADDRESS_TYPES).nullable(),
});

export const ScanEventSchema = z.object({
  sendId: z.string().nullable(), // ファームウェアが送信ごとのUUIDを振るようになるまではnull
  nodeId: z.string().min(1),
  location: z.string().min(1),
  receivedAt: z.iso.datetime(), // 受信エンドポイントで付与する。処理側のserverTimestampは使わない
  hashKeyVersion: z.string().min(1),
  devices: z.array(ScanEventDeviceSchema),
});

export type ScanEventDevice = z.infer<typeof ScanEventDeviceSchema>;
export type ScanEvent = z.infer<typeof ScanEventSchema>;
