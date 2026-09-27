const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// 日本時間のYYYY-MM-DD。基準値のバッチは日単位で処理するので、日付を文字列の鍵にする。
export const jstDate = (ms: number): string => new Date(ms + JST_OFFSET_MS).toISOString().slice(0, 10);

// 日本時間の時。稼働時間帯の判定に使う。UTCのまま判定すると、9時間ずれた時間帯を拾う。
export const jstHour = (ms: number): number => new Date(ms + JST_OFFSET_MS).getUTCHours();

// 日本時間のYYYY-MM-DDの、0時0分のミリ秒
export const jstDateStartMs = (date: string): number => Date.parse(`${date}T00:00:00.000Z`) - JST_OFFSET_MS;

// 日本時間で、指定した日のdays日前の日付。同じ曜日を遡るときは7の倍数を渡す。
export const jstDaysBefore = (date: string, days: number): string =>
  jstDate(jstDateStartMs(date) - days * DAY_MS);

// 指定した日の稼働時間帯[start, end)のミリ秒。congestion_recordsを日ごとに読むときの範囲に使う。
export const operatingRangeMs = (date: string, startHour: number, endHour: number): { start: number; end: number } => {
  const dayStart = jstDateStartMs(date);
  return { start: dayStart + startHour * 60 * 60 * 1000, end: dayStart + endHour * 60 * 60 * 1000 };
};
