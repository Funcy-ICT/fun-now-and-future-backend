// バックエンドの cloud/src/services/parseRawData.ts を、型を外して JavaScript にしたもの。
// 簡易な受け口（mock_server.mjs）で、サーバーが数える対象（Apple の Nearby Info）を数えるのに使う。
// 規則を変えるときは、parseRawData.ts と ESP32 の adv_parse.cpp も一緒に変える
const getByte = (data, i) => data.slice(i * 2, i * 2 + 2);

export const parseRawData = (a) => {
  let companyId = null;
  let isNearbyInfo = false;
  let pos = 0;
  while (pos < a.length / 2) {
    const length = parseInt(getByte(a, pos), 16);
    if (!Number.isInteger(length) || length === 0) break;
    const type = getByte(a, pos + 1).toUpperCase();
    if (type === "FF") {
      const id = (getByte(a, pos + 3) + getByte(a, pos + 2)).toUpperCase();
      companyId = id.length === 4 ? id : null;
      if (companyId === "004C") {
        let apple = pos + 4;
        const end = pos + 1 + length;
        while (apple < end) {
          const appleType = getByte(a, apple).toUpperCase();
          const appleLength = parseInt(getByte(a, apple + 1), 16);
          if (!Number.isInteger(appleLength)) break;
          if (appleType === "10") isNearbyInfo = true;
          apple = apple + 2 + appleLength;
        }
      }
      break;
    }
    pos = pos + 1 + length;
  }
  return { companyId, isNearbyInfo };
};
