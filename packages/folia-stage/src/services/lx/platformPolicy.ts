// src/services/lx/platformPolicy.ts
//
// Lxlia 的产品边界：只保留 LX 音源（内置源 + 自定义源）。
// Folia 原有的四个官方平台接入（网易云 / 酷狗 / QQ / 波点）已按产品决策移除。
// 所有仍可能触达这些官方 API 的调用点都经过这里判断，避免残留联网。

export const OFFICIAL_PLATFORM_APIS_ENABLED = false;

const OFFICIAL_PLATFORM_SOURCES: ReadonlySet<string> = new Set(['netease', 'qq', 'kugou', 'bodian']);

/** 该来源是否属于已移除的官方平台，且当前策略禁止访问。 */
export const isBlockedOfficialSource = (source: string): boolean => (
    !OFFICIAL_PLATFORM_APIS_ENABLED && OFFICIAL_PLATFORM_SOURCES.has(source)
);
