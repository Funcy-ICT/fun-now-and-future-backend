// 鍵は固定にする。将来交換したときに、どの鍵で作ったハッシュか区別できるよう版を残す。
export const HASH_KEY_VERSION = "v1";

const MIN_KEY_LENGTH = 32;

// macアドレスのハッシュ化に使う鍵。Secret Managerの値をCloud Runの環境変数にマウントして渡す。
// 鍵が短いとハッシュの強度が落ちるので、未設定や短すぎる場合は例外を投げる。
export const getHashKey = (): string => {
  const key = process.env.MAC_HASH_KEY;
  if (!key || key.length < MIN_KEY_LENGTH) {
    throw new Error("MAC_HASH_KEY is missing or too short");
  }
  return key;
};
