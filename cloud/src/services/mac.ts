// ハッシュ化の前に必ず通す。区切り文字や大文字小文字の違いで、同じ端末が別のハッシュ値にならないようにするため。
// 例外のメッセージには入力値を含めない。macアドレスがログに残るのを防ぐため。
export const normalizeMac = (mac: string): string => {
  const hex = mac.replace(/[:\-.\s]/g, "").toUpperCase();
  if (!/^[0-9A-F]{12}$/.test(hex)) {
    throw new Error("Invalid MAC address");
  }
  return hex;
};
