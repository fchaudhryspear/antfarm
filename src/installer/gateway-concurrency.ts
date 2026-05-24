export const DEFAULT_MAX_IMMEDIATE_GATEWAY_SPAWNS = 5;

export type ImmediateDispatchSelection = {
  cap: number;
  selected: string[];
  deferred: string[];
};

export function resolveImmediateGatewaySpawnCap(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.ANTFARM_MAX_IMMEDIATE_GATEWAY_SPAWNS;
  if (!raw) return DEFAULT_MAX_IMMEDIATE_GATEWAY_SPAWNS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_MAX_IMMEDIATE_GATEWAY_SPAWNS;
  return parsed;
}

export function selectImmediateDispatchAgents(
  dispatchedAgentIds: string[],
  cap = resolveImmediateGatewaySpawnCap(),
): ImmediateDispatchSelection {
  const uniqueAgents = [...new Set(dispatchedAgentIds)];
  return {
    cap,
    selected: uniqueAgents.slice(0, cap),
    deferred: uniqueAgents.slice(cap),
  };
}
