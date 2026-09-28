import { hc } from "hono/client";
// cloudのソースを直接読むと、このtsconfigの設定でcloud側のファイルが型エラーになるので、出力した型定義を読む。
// 型定義は、cloudでnpm run build:typesを実行すると作られる
import type { AppType } from "../../../cloud/types/app";

// バックエンドのルートの型から、パス、クエリ、レスポンスの型が決まる
export const api = hc<AppType>(import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080");
