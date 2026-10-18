import { Timestamp } from "firebase-admin/firestore";
import { NodeLastSeen } from "../schema/node_last_seen";

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
