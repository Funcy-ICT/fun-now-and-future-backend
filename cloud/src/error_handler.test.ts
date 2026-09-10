import { Hono } from "hono";
import { errorHandler } from "./middlewares/error_handler";

describe("errorHandler", () => {
    test("未キャッチの例外発生時に500と統一フォーマットのレスポンスを返す", async () => {
        const testApp = new Hono();
        testApp.onError(errorHandler);
        testApp.get("/test-error", () => {
            throw new Error("意図的なエラー");
        });

        const res = await testApp.request("/test-error");

        expect(res.status).toBe(500);

        const json = await res.json();
        expect(json).toEqual({
            error: "Internal Server Error",
            message: "予期せぬエラーが発生しました",
        });
    });
});