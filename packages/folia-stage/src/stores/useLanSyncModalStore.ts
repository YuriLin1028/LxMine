import { create } from 'zustand';

// src/stores/useLanSyncModalStore.ts
// 局域网同步弹窗的开合状态；命令面板与设置入口都通过它打开同一个弹窗。

type LanSyncModalStore = {
    isOpen: boolean;
    open: () => void;
    close: () => void;
    toggle: () => void;
};

export const useLanSyncModalStore = create<LanSyncModalStore>(set => ({
    isOpen: false,
    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false }),
    toggle: () => set(state => ({ isOpen: !state.isOpen })),
}));
