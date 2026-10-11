import { getNodesConfig, updateConfigWithHistory } from "../repositories/firestore";
import { StoredConfig } from "../schema/config_meta";
import { NodesConfig, NodesConfigInput } from "../schema/nodes_config";

// 管理画面からの保存。inputはNodesConfigInputSchemaで検証したもの。versionが食い違えばConfigVersionConflictErrorを投げる
export const saveNodesConfig = async (
  input: NodesConfigInput,
  expectedVersion: number,
  updatedBy: string | null,
): Promise<number> => updateConfigWithHistory("nodes", expectedVersion, () => input, updatedBy);

export const getNodes = async (): Promise<StoredConfig<NodesConfig>> => getNodesConfig();
