import { useEffect } from 'react';
import { useLanSyncModalStore } from '../../stores/useLanSyncModalStore';

// src/components/app/LanSyncAutoApply.tsx
// 全局接收邀请；数据由 respondLanSync 在成功回执之前完成持久化。

const LanSyncAutoApply: React.FC = () => {
    useEffect(() => {
        const bridge = typeof window !== 'undefined' ? window.electron?.lanSync : null;
        if (!bridge?.onIncoming) return undefined;
        const offIncoming = bridge.onIncoming(() => useLanSyncModalStore.getState().open());
        return offIncoming;
    }, []);

    return null;
};

export default LanSyncAutoApply;
