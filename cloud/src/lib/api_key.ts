// esp32とサイネージが送るAPIキー。Secret Managerの値をCloud Runの環境変数にマウントして渡す。
// 未設定のまま動くと、すべての要求が401になり、データが止まったことに気づきにくいので、例外を投げる。
export const getApiKey = (): string => {
  const key = process.env.ESP32_API_KEY;
  if (!key) {
    throw new Error("ESP32_API_KEY is missing");
  }
  return key;
};
