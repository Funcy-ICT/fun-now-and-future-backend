import { z } from "zod";


export const deviceBase = {
  mac: z.string().min(1, "mac is required"),
  rssi: z.number().min(-100, "rssi must be greater than or equal to -100").max(0, "rssi must be less than or equal to 0"),
}

export const parsedDeviceSchema = z.object({
  ...deviceBase,
  format: z.literal("parsed"),
  companyId: z.string().min(1, "companyId is required"),
  nearbyInfo: z.string().min(1, "nearbyInfo is required"),
});

export const rawDeviceSchema = z.object({
  ...deviceBase,
  format: z.literal("raw"),
  rawData: z.string().min(1, "rawData is required"),
});

export const devicesSchema = z.discriminatedUnion("format", [parsedDeviceSchema, rawDeviceSchema]);

export const SensorDataSchema = z.object({
  nodeId: z.string().min(1, "nodeId is required"),
  location: z.string().min(1, "location is required"),
  devices: z.array(devicesSchema).min(1, "devices must be a non-empty array")
});



export type SensorData = z.infer<typeof SensorDataSchema>;
export type Device = z.infer<typeof devicesSchema>;
export type ParsedDevice = z.infer<typeof parsedDeviceSchema>;
export type RawDevice = z.infer<typeof rawDeviceSchema>;