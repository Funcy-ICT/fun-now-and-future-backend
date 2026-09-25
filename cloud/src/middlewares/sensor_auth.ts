const VALID_API_KEY = process.env.ESP32_API_KEY;

export const sensorAuthMiddleware = (key: string | undefined) => {

  if (!key || key !== VALID_API_KEY) {
    return 0;
  } else {
    return -1;
  }
}