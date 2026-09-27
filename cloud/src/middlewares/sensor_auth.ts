import { getApiKey } from "../lib/api_key";

export const sensorAuthMiddleware = (key: string | undefined) => {

  if (!key || key !== getApiKey()) {
    return -1;
  } else {
    return 0;
  }
}
