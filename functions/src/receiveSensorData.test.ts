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
				sensor_id: "receiveSensorDataTestId",
				location: "london",
				ble_advertising_raw_data: ["raw_packet_1"],
				timestamp: new Date().toISOString(),
				ble_mac_addresses: ["AA:BB:CC:DD:EE:01"],
			}),
		});

		expect(res.status).toBe(200);

		const json = await res.json();
		expect(json.status).toBe("success");
		expect(json.data).toEqual({
			sensor_id: "receiveSensorDataTestId",
			location: "london",
			ble_advertising_raw_data: ["raw_packet_1"],
			timestamp: expect.any(String),
			ble_mac_addresses: ["AA:BB:CC:DD:EE:01"],
		});
	});

	test("API Keyがない場合401を返す", async () => {
		const res = await app.request("/receiveSensorData", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				sensor_id: "receiveSensorDataTestId",
				location: "london",
				ble_advertising_raw_data: ["raw_packet_1"],
				timestamp: new Date().toISOString(),
				ble_mac_addresses: ["AA:BB:CC:DD:EE:01"],
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
				sensor_id: "receiveSensorDataTestId",
				location: "london",
				ble_advertising_raw_data: ["raw_packet_1"],
				timestamp: new Date().toISOString(),
				ble_mac_addresses: ["AA:BB:CC:DD:EE:01"],
			}),
		});

		expect(res.status).toBe(401);

		const json = await res.json();
		expect(json.status).toBe("error");
	});
});
