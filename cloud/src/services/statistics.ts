// 昇順に並んだ配列から、最近傍順位法でパーセンタイルを取る。ceil(p × n)番目の値。
// 補間しないのは、TSと将来のSQLで同じ値にするため。issue #24にも方式の指定は無い。
export const percentileOfSorted = (sorted: number[], p: number): number => {
  if (sorted.length === 0) throw new Error("percentileOfSorted needs at least one value");
  const rank = Math.ceil(p * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
};

export const medianOfSorted = (sorted: number[]): number => percentileOfSorted(sorted, 0.5);

export const median = (values: number[]): number => medianOfSorted([...values].sort((a, b) => a - b));
