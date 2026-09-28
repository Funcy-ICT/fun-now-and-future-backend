// swaggerに説明を出すため、zは@hono/zod-openapiから読む(zodを拡張した同じもの)
import { z } from "@hono/zod-openapi";


export const deviceBase = {
  mac: z.string().min(1, "mac is required").openapi({
    description: "区切り文字と大文字小文字は問わない。12桁の16進数でなければ、POST全体が400(mac is invalid)になる。"
      + "受信の時点でハッシュ化し、そのままでは保存しない",
    example: "AA:BB:CC:DD:EE:01",
  }).transform(s => s.toUpperCase()),
  rssi: z.number().min(-127, "rssi must be greater than or equal to -127").max(20, "rssi must be less than or equal to 20").openapi({
    description: "-127から20まで。範囲外が1台でも含まれると、POST全体が400になる",
    example: -60,
  }),
};

export const parsedDeviceSchema = z.object({
  ...deviceBase,
  format: z.literal("parsed").openapi({ description: "esp32でパースした結果を送る" }),
  companyId: z.string().length(4).nullable().openapi({ description: "Company ID(16進数4桁)", example: "004C" }),
  isNearbyInfo: z.boolean().openapi({ description: "AppleのNearby Infoを含むか", example: true }),
});

export const rawDeviceSchema = z.object({
  ...deviceBase,
  format: z.literal("raw").openapi({ description: "アドバタイズの生データを送る。クラウドでパースする(Wi-Fi環境を想定)" }),
  rawData: z.string().min(1, "rawData is required").openapi({ description: "アドバタイズのデータ(16進数)", example: "02011a020a0c" }),
});

export const devicesSchema = z.discriminatedUnion("format", [parsedDeviceSchema, rawDeviceSchema]);

export const SensorDataSchema = z.object({
  sendId: z.string().min(1, "sendId must not be empty").max(64, "sendId must be 64 characters or fewer").optional().openapi({
    description: "送信ごとのUUID(任意)。再送のときは同じ値を使う",
    example: "3f2b8c1e-5d4a-4e6b-9c7d-1a2b3c4d5e6f",
  }),
  nodeId: z.string().min(1, "nodeId is required").openapi({ example: "esp32_cafeteria_01" }),
  location: z.string().min(1, "location is required").openapi({ example: "cafeteria" }),
  devices: z.array(devicesSchema).max(256, "devices must be 256 or fewer").default([]).openapi({
    description: "検出した端末。256件まで。0件でもよい",
  }),
});

export const ParsedSensorDataSchema = z.object({
  nodeId: z.string().min(1, "nodeId is required"),
  location: z.string().min(1, "location is required"),
  devices: z.array(parsedDeviceSchema).default([])
});



export type SensorData = z.infer<typeof SensorDataSchema>;
export type Device = z.infer<typeof devicesSchema>;
export type ParsedDevice = z.infer<typeof parsedDeviceSchema>;
export type RawDevice = z.infer<typeof rawDeviceSchema>;
export type ParsedSensorData = z.infer<typeof ParsedSensorDataSchema>;