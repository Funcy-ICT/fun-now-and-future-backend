import { publishAggregateRun } from "./repositories/pubsub";
import { getPubSub } from "./lib/pubsub";
import { AggregateRun } from "./schema/aggregate_run";

jest.mock("./lib/pubsub", () => ({
	...jest.requireActual("./lib/pubsub"),
	getPubSub: jest.fn(),
}));

const run: AggregateRun = {
	windowStart: "2026-09-20T12:00:00.000Z",
	computedAt: "2026-09-20T12:06:00.000Z",
	configHash: "a".repeat(64),
	stagesJson: '[{"name":"dedupe"}]',
	locations: [
		{
			location: "london",
			weekday: 0,
			uniqueDeviceCount: 3,
			stageTrace: [{ stageName: "dedupe", countBefore: 5, countAfter: 3 }],
		},
	],
	nodes: [{ nodeId: "node-01", location: "london", postCount: 2, totalMacCount: 5 }],
};

describe("publishAggregateRun", () => {
	const original = process.env.AGGREGATE_RUNS_TOPIC;
	const publishMessage = jest.fn().mockResolvedValue("message-id");
	const topic = jest.fn().mockReturnValue({ publishMessage });

	beforeEach(() => {
		publishMessage.mockClear();
		topic.mockClear();
		(getPubSub as jest.Mock).mockReturnValue({ topic });
	});

	afterEach(() => {
		if (original === undefined) {
			delete process.env.AGGREGATE_RUNS_TOPIC;
		} else {
			process.env.AGGREGATE_RUNS_TOPIC = original;
		}
	});

	test("トピックが未設定なら、publishしない", async () => {
		delete process.env.AGGREGATE_RUNS_TOPIC;
		await publishAggregateRun(run);
		expect(getPubSub).not.toHaveBeenCalled();
	});

	test("トピックが設定されていれば、そのトピックにpublishする", async () => {
		process.env.AGGREGATE_RUNS_TOPIC = "aggregate-runs";
		await publishAggregateRun(run);
		expect(topic).toHaveBeenCalledWith("aggregate-runs");
		expect(publishMessage).toHaveBeenCalledWith({ json: run });
	});

	test("スキーマに合わなければ、publishせずに例外を投げる", async () => {
		process.env.AGGREGATE_RUNS_TOPIC = "aggregate-runs";
		const invalid = { ...run, configHash: "" };
		await expect(publishAggregateRun(invalid)).rejects.toThrow();
		expect(publishMessage).not.toHaveBeenCalled();
	});
});
