import { normalizeDevice } from "./scan_service";
import { hashMac, inferAddressType } from "./mac";
import { HASH_KEY_VERSION } from "../lib/hash_key";
import { ScanEvent, ScanEventDevice } from "../schema/scan_event";
import { ParsedDevice, SensorData } from "../schema/sensor_data";

// 受信したデータから、Pub/Subに流すメッセージを組み立てる。生のmacはここでハッシュ値になり、以降は出てこない。
// rawの検出は、集計と同じnormalizeDeviceでパースしてcompanyIdとisNearbyInfoを埋める。rawDataも残す。
export const buildScanEvent = (sensorData: SensorData, receivedAt: Date, key: string): ScanEvent => ({
  sendId: sensorData.sendId ?? null,
  nodeId: sensorData.nodeId,
  location: sensorData.location,
  receivedAt: receivedAt.toISOString(),
  hashKeyVersion: HASH_KEY_VERSION,
  devices: sensorData.devices.map(device => {
    const parsed = normalizeDevice(device);
    return {
      macHash: hashMac(device.mac, key),
      rssi: Math.round(device.rssi), // BigQueryの列は整数。小数で送られてきても書き込みに失敗しないよう丸める
      format: device.format,
      rawData: device.format === "raw" ? device.rawData : null,
      companyId: parsed.companyId,
      isNearbyInfo: parsed.isNearbyInfo,
      addressType: inferAddressType(device.mac),
    };
  }),
});

// 保存したメッセージの検出を、集計のフィルタが受け取るParsedDeviceに変換する。macにはハッシュ値が入る。
// isNearbyInfoがnullのとき(LoRaのparsed)はfalseとして扱う。フィルタでの扱いは、LoRaを導入するときに決める。
export const toParsedDevice = (device: ScanEventDevice): ParsedDevice => ({
  mac: device.macHash,
  rssi: device.rssi,
  format: "parsed",
  companyId: device.companyId,
  isNearbyInfo: device.isNearbyInfo ?? false,
});
