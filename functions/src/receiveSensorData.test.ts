import { createRequest, createResponse } from "node-mocks-http";
import { receiveSensorData } from "./index";


describe("receiveSensorData", () => {
	test("POSTリクエストを受け取れる", async () => {
		const req: any = createRequest({
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: {
				sensor_id: "esp32_ryoHasegawa_99",
				location: "moscow",
				ble_device_count: 999,
			},
		});

		const res = createResponse();

		await receiveSensorData(req, res);

		expect(res.statusCode).toBe(200);

		const json = res._getJSONData();
		expect(json.status).toBe("success");
		expect(json.data).toEqual({
			sensor_id: "esp32_ryoHasegawa_99",
			location: "moscow",
			ble_device_count: 999,
		});
	});

	test("GETリクエストは405を返す", async () => {
		const req: any = createRequest({
			method: "GET",
		});

		const res: any = createResponse();

		await receiveSensorData(req, res);

		expect(res.statusCode).toBe(405);
		expect(res._getData()).toBe("Method Not Allowed");
	});

	test("OPTIONSリクエストは204を返す", async() => {
		const req: any = createRequest({
			method: "OPTIONS",
		});

		const res: any = createResponse();

		await receiveSensorData(req, res);

		expect(res.statusCode).toBe(204);
		expect(res.getHeader("Access-Control-Allow-Origin")).toBe("*");
		expect(res.getHeader("Access-Control-Allow-Methods")).toBe("POST");
		expect(res.getHeader("Access-Control-Allow-Headers")).toBe("Content-Type");
	});
});