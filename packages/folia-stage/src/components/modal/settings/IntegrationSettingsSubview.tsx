import React from 'react';
import LxSourcesSettingsSubview from './LxSourcesSettingsSubview';

// src/components/modal/settings/IntegrationSettingsSubview.tsx
// 「连接与集成」（Discord / OBS / 歌词接口 / Navidrome / Stage）按产品要求整体移除。
// 这里的入口保留原组件名，只渲染「音源」管理，避免动 SettingsModal 的装配代码。

const IntegrationSettingsSubview: React.FC<Record<string, unknown>> = () => <LxSourcesSettingsSubview />;

export default IntegrationSettingsSubview;
