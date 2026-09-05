import { parseRawData } from "./parseRawData";
import { Device } from "../schema/sensor_data";
import { ParsedDevice } from "../schema/sensor_data";
import { SensorData } from "../schema/sensor_data";
import { ParsedSensorData } from "../schema/sensor_data";


export const normalizeDevice = (device: Device): ParsedDevice => {
  switch (device.format) {
    case "parsed":
      return device;
    case "raw": {
      const { companyId, isNearbyInfo } = parseRawData(device.rawData);
      return {
        mac: device.mac,
        rssi: device.rssi,
        format: "parsed",
        companyId,
        isNearbyInfo,
      };
    }
  }
};


const handleSensorData = (sensorData: SensorData): ParsedSensorData => ({
  nodeId: sensorData.nodeId,
  location: sensorData.location,
  devices: sensorData.devices.map(normalizeDevice),
});


export type UniqueDevice = {
  mac: string;
  rssi: number;
};

export const dedupeByMac = (devices: ParsedDevice[]): UniqueDevice[] => {
  const maxRssiByMac = new Map<string, number>();

  for (const device of devices) {
    const current = maxRssiByMac.get(device.mac);
    if (current === undefined || device.rssi > current) {
      maxRssiByMac.set(device.mac, device.rssi);
    }
  }

  return [...maxRssiByMac].map(([mac, rssi]) => ({ mac, rssi }));
};

export const groupByLocation = (
  scans: ParsedSensorData[],
): Map<string, ParsedDevice[]> => {
  const byLocation = new Map<string, ParsedDevice[]>();

  for (const scan of scans) {
    const devices = byLocation.get(scan.location) ?? [];
    devices.push(...scan.devices);
    byLocation.set(scan.location, devices);
  }

  return byLocation;
};