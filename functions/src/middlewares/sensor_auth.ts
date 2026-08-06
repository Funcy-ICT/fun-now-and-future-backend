const VALID_API_KEY = "funcy_esp32_secret_key_2026";

export const sensorAuthMiddleware = async (key: string | undefined) => {
  
  if(!key || key !== VALID_API_KEY) {
    return 0;
}else{
    return -1;
}
}