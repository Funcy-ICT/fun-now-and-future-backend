import { createHmac } from "crypto";
import { AddressType } from "../schema/scan_event";

// ハッシュ化の前に必ず通す。区切り文字や大文字小文字の違いで、同じ端末が別のハッシュ値にならないようにするため。
// 例外のメッセージには入力値を含めない。macアドレスがログに残るのを防ぐため。
export const normalizeMac = (mac: string): string => {
  const hex = mac.replace(/[:\-.\s]/g, "").toUpperCase();
  if (!/^[0-9A-F]{12}$/.test(hex)) {
    throw new Error("Invalid MAC address");
  }
  return hex;
};

// スキーマの検証後、ハッシュ化の前に呼ぶ。不正なmacが1つでもあれば、受信を400で返すために使う。
export const isValidMac = (mac: string): boolean => {
  try {
    normalizeMac(mac);
    return true;
  } catch {
    return false;
  }
};

// 正規化したmacアドレスのHMAC-SHA256を、大文字の16進64文字で返す。
// macは48ビットしかなく、素のSHA-256では総当たりで元に戻せるため、鍵付きにする。
// 大文字にそろえるのは、pending_scansから読み出すときにスキーマのtoUpperCaseを通っても値が変わらないようにするため。
export const hashMac = (mac: string, key: string): string =>
  createHmac("sha256", key).update(normalizeMac(mac)).digest("hex").toUpperCase();

// macアドレスの最上位2ビットから、ランダムアドレスの種別を推定する。ハッシュ化するとビットが読めなくなるので、ハッシュ化の前に呼ぶ。
// 最上位ビットは、表記の先頭のバイトにある前提。esp32が送るmacの並びが逆なら結果が変わるので、実機のデータで確認が必要。
// publicアドレスのビットも何でもありうるため、これは推定にとどまり、publicかどうかは区別できない。
export const inferAddressType = (mac: string): AddressType | null => {
  const firstByte = parseInt(normalizeMac(mac).slice(0, 2), 16);
  switch (firstByte >> 6) {
    case 0b11: return "random_static";
    case 0b01: return "random_resolvable";
    case 0b00: return "random_non_resolvable";
    default: return null; // 0b10は仕様上使われない
  }
};
