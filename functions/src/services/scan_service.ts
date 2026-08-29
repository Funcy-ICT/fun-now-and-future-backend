import { parseRawData } from "./parseRawData";
import { Device } from "../schema/sensor_data";
import { ParsedDevice } from "../schema/sensor_data";
import { SensorData } from "../schema/sensor_data";


export const normalizeDevice = (device: Device): ParsedDevice => {
  switch (device.format) {
    case "parsed":
      return device;
    case "raw":
      const [companyId, nearbyInfo] = parseRawData(device.rawData);
      return {
        mac: device.mac,
        rssi: device.rssi,
        format: "parsed",
        companyId,
        nearbyInfo,
      };
  }
}


const handleSensorData = (sensorData: SensorData): SensorData => ({
  nodeId: sensorData.nodeId,
  location: sensorData.location,
  devices: sensorData.devices.map(normalizeDevice),
});