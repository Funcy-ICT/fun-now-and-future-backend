import { parseRawData } from "./parseRawData";
import { Device } from "../schema/sensor_data";
import { ParsedDevice } from "../schema/sensor_data";
import { SensorData } from "../schema/sensor_data";
import { ParsedSensorData } from "../schema/sensor_data";
import { NodeStatusData } from "../repositories/firestore";
import { Timestamp } from "firebase-admin/firestore";


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

export type NodeHealthStat = {
  nodeId: string;
  location: string;
  postCount: number;
  totalMacCount: number;
};

export const aggregateNodeHealth = (
  scans: { nodeId: string; location: string; devices: unknown[] }[],
  windowStart: Timestamp,
): NodeStatusData[] => {
  const byNode = new Map<string, NodeStatusData>();

  for (const scan of scans) {
    const current = byNode.get(scan.nodeId);
    if (current === undefined) {
      byNode.set(scan.nodeId, {
        nodeId: scan.nodeId,
        location: scan.location,
        windowStart,
        postCount: 1,
        totalMacCount: scan.devices.length,
      });
    } else {
      current.postCount += 1;
      current.totalMacCount += scan.devices.length;
    }
  }

  return [...byNode.values()];
};

const WINDOW_MS = 5 * 60 * 1000;

export const previousWindowStart = (date: Date): Timestamp => {
  const currentWindowStartMs = Math.floor(date.getTime() / WINDOW_MS) * WINDOW_MS;
  const previousWindowStartMs = currentWindowStartMs - WINDOW_MS;
  return Timestamp.fromMillis(previousWindowStartMs);
};

export const isAppleNearbyDevice = (device: ParsedDevice): boolean =>
  device.companyId === "004C" && device.isNearbyInfo;

export const filterByRssi = (
  devices: UniqueDevice[],
  minRssi: number
): UniqueDevice[] => {
  return devices.filter(device => device.rssi >= minRssi);
}