import { Timestamp } from "firebase-admin/firestore";
import { NodeLastSeen } from "../schema/node_last_seen";
import { jstHour } from "./jst";

// その窓に送ってきたノードの、locationと最終受信時刻を更新する。初めてのノードは、動いている状態で足す。
// 状態(state)は変えない。遅れて集計した古い窓では、最終受信時刻を戻さない
export const recordLastSeen = (
  current: NodeLastSeen,
  seen: { nodeId: string; location: string }[],
  windowStart: Timestamp,
): NodeLastSeen => {
  const nodes = { ...current.nodes };

  for (const { nodeId, location } of seen) {
    const entry = nodes[nodeId];
    if (entry === undefined) {
      nodes[nodeId] = { location, lastSeenAt: windowStart, state: "up", stateChangedAt: windowStart };
    } else if (windowStart.toMillis() >= entry.lastSeenAt.toMillis()) {
      nodes[nodeId] = { ...entry, location, lastSeenAt: windowStart };
    }
  }

  return { nodes };
};

const WINDOW_MS = 5 * 60 * 1000;
// 受信が2窓(10分)続けて無ければ停止とみなす。1窓だけの欠けは、送信の遅れでも起きるため
export const NODE_DOWN_AFTER_MS = 2 * WINDOW_MS;

export type NodeTransition = {
  event: "node_down" | "node_recovered";
  nodeId: string;
  location: string;
  lastSeenAt: Timestamp;
};

export type NodeJudgeInput = {
  lastSeen: NodeLastSeen; // recordLastSeenで、この窓の受信を反映したもの
  seenNodeIds: Set<string>; // この窓に送ってきたノード
  windowStart: Timestamp;
  retiredNodeIds: Set<string>;
  // locationの稼働時間帯[startHour, endHour)。日本時間の時
  operatingHours: (location: string) => { startHour: number; endHour: number };
};

const inOperatingHours = (ms: number, hours: { startHour: number; endHour: number }): boolean => {
  const hour = jstHour(ms);
  return hours.startHour <= hour && hour < hours.endHour;
};

// 停止と復旧を判定し、状態を変えた記録と、変わったノードを返す。撤去済みのノードは判定しない。
// 停止は、受信の無い2つの窓が、どちらもlocationの稼働時間帯の中にあるときだけにする。夜に止めるノードや、朝の起動の遅れで通知しないため
export const judgeNodes = (input: NodeJudgeInput): { lastSeen: NodeLastSeen; transitions: NodeTransition[] } => {
  const nodes = { ...input.lastSeen.nodes };
  const transitions: NodeTransition[] = [];
  const now = input.windowStart.toMillis();

  for (const [nodeId, entry] of Object.entries(nodes)) {
    if (input.retiredNodeIds.has(nodeId)) continue;

    if (entry.state === "down" && input.seenNodeIds.has(nodeId)) {
      nodes[nodeId] = { ...entry, state: "up", stateChangedAt: input.windowStart };
      transitions.push({ event: "node_recovered", nodeId, location: entry.location, lastSeenAt: entry.lastSeenAt });
      continue;
    }

    const hours = input.operatingHours(entry.location);
    const silent = now - entry.lastSeenAt.toMillis() >= NODE_DOWN_AFTER_MS;
    const bothWindowsInHours = inOperatingHours(now, hours) && inOperatingHours(now - WINDOW_MS, hours);
    if (entry.state === "up" && silent && bothWindowsInHours) {
      nodes[nodeId] = { ...entry, state: "down", stateChangedAt: input.windowStart };
      transitions.push({ event: "node_down", nodeId, location: entry.location, lastSeenAt: entry.lastSeenAt });
    }
  }

  return { lastSeen: { nodes }, transitions };
};

// Cloud Loggingで絞り込めるよう、1行のJSONで出す。メールはこのログのアラートで送る
export const logNodeTransition = (transition: NodeTransition): void => {
  const line = JSON.stringify({
    severity: transition.event === "node_down" ? "ERROR" : "NOTICE",
    message: transition.event === "node_down" ? "node down" : "node recovered",
    event: transition.event,
    nodeId: transition.nodeId,
    location: transition.location,
    lastSeenAt: transition.lastSeenAt.toDate().toISOString(),
  });
  if (transition.event === "node_down") {
    console.error(line);
  } else {
    console.info(line);
  }
};
