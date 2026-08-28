import { app } from "./app";

describe("receiveSensorData", () => {
	test("POSTリクエストを受け取れる", async () => {
		const res = await app.request("/receiveSensorData", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": "funcy_esp32_secret_key_2026",
			},
			body: JSON.stringify({
				"nodeId": "node-01",
				"location": "london",
				"devices": [
					{ "format": "raw", "mac": "AA:BB:CC:DD:EE:01", "rssi": -60, "rawData": "02011a020a0c" },
					{ "format": "parsed", "mac": "AA:BB:CC:DD:EE:02", "rssi": -72, "companyId": "004C", "nearbyInfo": "10" }
				]
			}),
		});

		expect(res.status).toBe(200);

		const json = await res.json();
		expect(json.status).toBe("success");
		expect(json.data).toEqual({
			"nodeId": "node-01",
			"location": "london",
			"devices": [
				{ "format": "raw", "mac": "AA:BB:CC:DD:EE:01", "rssi": -60, "rawData": "02011a020a0c" },
				{ "format": "parsed", "mac": "AA:BB:CC:DD:EE:02", "rssi": -72, "companyId": "004C", "nearbyInfo": "10" }
			]
		});
	});

	test("API Keyがない場合401を返す", async () => {
		const res = await app.request("/receiveSensorData", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				"nodeId": "node-01",
				"location": "london",
				"devices": [
					{ "format": "raw", "mac": "AA:BB:CC:DD:EE:01", "rssi": -60, "rawData": "02011a020a0c" },
					{ "format": "parsed", "mac": "AA:BB:CC:DD:EE:02", "rssi": -72, "companyId": "004C", "nearbyInfo": "10" }
				]
			}),
		});

		expect(res.status).toBe(401);

		const json = await res.json();
		expect(json.status).toBe("error");
		expect(json.message).toBe("Unauthorized: Invalid or missing API Key");
	});

	test("API Keyが間違っている場合401を返す", async () => {
		const res = await app.request("/receiveSensorData", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": "wrong_secret_key",
			},
			body: JSON.stringify({
				"nodeId": "node-01",
				"location": "london",
				"devices": [
					{ "format": "raw", "mac": "AA:BB:CC:DD:EE:01", "rssi": -60, "rawData": "02011a020a0c" },
					{ "format": "parsed", "mac": "AA:BB:CC:DD:EE:02", "rssi": -72, "companyId": "004C", "nearbyInfo": "10" }
				]
			}),
		});

		expect(res.status).toBe(401);

		const json = await res.json();
		expect(json.status).toBe("error");
	});
});
