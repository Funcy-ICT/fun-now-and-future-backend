import { publishScanEvent } from "./repositories/pubsub";
import { getPubSub } from "./lib/pubsub";
import { ScanEvent } from "./schema/scan_event";

// getPubSubだけをモックにする。トピック名を読むgetScanEventsTopicは本物を使う
jest.mock("./lib/pubsub", () => ({
	...jest.requireActual("./lib/pubsub"),
	getPubSub: jest.fn(),
}));

const event: ScanEvent = {
	sendId: null,
	nodeId: "node-01",
	location: "london",
	receivedAt: "2026-09-20T12:00:00.000Z",
	hashKeyVersion: "v1",
	devices: [
		{
			macHash: "A".repeat(64),
			rssi: -60,
			format: "raw",
			rawData: "02011a020a0c",
			companyId: null,
			isNearbyInfo: false,
			addressType: "random_static",
		},
	],
};

describe("publishScanEvent", () => {
	const original = process.env.SCAN_EVENTS_TOPIC;
	const publishMessage = jest.fn().mockResolvedValue("message-id");
	const topic = jest.fn().mockReturnValue({ publishMessage });

	beforeEach(() => {
		publishMessage.mockClear();
		topic.mockClear();
		(getPubSub as jest.Mock).mockReturnValue({ topic });
	});

	afterEach(() => {
		if (original === undefined) {
			delete process.env.SCAN_EVENTS_TOPIC;
		} else {
			process.env.SCAN_EVENTS_TOPIC = original;
		}
	});

	test("トピックが未設定なら、publishせずに例外を投げる", async () => {
		delete process.env.SCAN_EVENTS_TOPIC;
		await expect(publishScanEvent(event)).rejects.toThrow("SCAN_EVENTS_TOPIC is not set");
		expect(getPubSub).not.toHaveBeenCalled();
		expect(publishMessage).not.toHaveBeenCalled();
	});

	test("トピックが設定されていれば、メッセージをそのトピックにpublishする", async () => {
		process.env.SCAN_EVENTS_TOPIC = "scan-events";
		await publishScanEvent(event);
		expect(topic).toHaveBeenCalledWith("scan-events");
		expect(publishMessage).toHaveBeenCalledWith({ json: event });
	});

	test("スキーマに合わないメッセージは、publishせずに例外を投げる", async () => {
		process.env.SCAN_EVENTS_TOPIC = "scan-events";
		const invalid = { ...event, devices: [{ ...event.devices[0], macHash: "" }] };
		await expect(publishScanEvent(invalid)).rejects.toThrow();
		expect(publishMessage).not.toHaveBeenCalled();
	});

	test("publishに失敗したら、その例外をそのまま投げる", async () => {
		process.env.SCAN_EVENTS_TOPIC = "scan-events";
		publishMessage.mockRejectedValueOnce(new Error("publish failed"));
		await expect(publishScanEvent(event)).rejects.toThrow("publish failed");
	});
});
