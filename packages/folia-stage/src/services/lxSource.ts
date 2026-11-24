// src/services/lxSource.ts
// 自定义源（LX JS 源）管理的渲染层封装。脚本执行与存储都在主进程 electron/lx。

export type LxSourceInfo = {
    id: string;
    name: string;
    description: string;
    version: string;
    author: string;
    homepage: string;
    size: number;
    importedAt: number;
};

const bridge = () => (
    typeof window !== 'undefined' ? window.electron?.lx ?? null : null
);

export const isLxSourceAvailable = (): boolean => Boolean(bridge());

export const listLxSources = async (): Promise<LxSourceInfo[]> => (
    (await bridge()?.listSources()) as LxSourceInfo[] | undefined ?? []
);

export const importLxSourceText = async (script: string): Promise<LxSourceInfo | null> => (
    (await bridge()?.importSource(script)) as LxSourceInfo | null ?? null
);

export const importLxSourceFile = async (): Promise<LxSourceInfo | null> => (
    (await bridge()?.importSourceFile()) as LxSourceInfo | null ?? null
);

export const removeLxSources = async (ids: string[]): Promise<LxSourceInfo[]> => (
    (await bridge()?.removeSources(ids)) as LxSourceInfo[] | undefined ?? []
);

export const setActiveLxSource = async (id: string): Promise<void> => {
    await bridge()?.setActiveSource(id);
};

export const getActiveLxSourceId = async (): Promise<string | null> => {
    const status = await bridge()?.getSourceStatus();
    return status?.activeId ?? null;
};
