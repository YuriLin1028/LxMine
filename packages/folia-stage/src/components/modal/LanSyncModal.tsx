import React from 'react';
import { useLanSyncModalStore } from '../../stores/useLanSyncModalStore';
import LanSyncPanel from './LanSyncPanel';

// src/components/modal/LanSyncModal.tsx
// 命令行 / 快捷入口用的弹窗外壳；面板本体在 LanSyncPanel，设置页内嵌复用。

const LanSyncModal: React.FC = () => {
    const isOpen = useLanSyncModalStore(state => state.isOpen);
    const close = useLanSyncModalStore(state => state.close);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[2400] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-[560px] max-w-[92vw] max-h-[82vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#141416] p-6 text-zinc-200 shadow-2xl">
                <h2 className="text-lg font-semibold">局域网同步</h2>
                <div className="mt-3">
                    <LanSyncPanel onClose={close} />
                </div>
            </div>
        </div>
    );
};

export default LanSyncModal;
