import { OnlineProviderError } from '../../types/onlineMusic';
import type { OnlineMusicProvider, OnlineProviderId, ProviderCapabilities } from '../../types/onlineMusic';
import type { SongResult } from '../../types';
import { getPlaybackSourceRef } from '../../utils/appPlaybackGuards';
import { lxProvider, lxKgProvider, lxWyProvider, lxTxProvider } from './lxProvider';

// src/services/onlineMusic/providerRegistry.ts
//
// Lxlia：已移除 Folia 内置的网易云 / 酷狗 / QQ / 波点四个官方平台 provider。
// 在线搜索与播放一律走 LX 音源（内置源移植 + 自定义源），不再直接连接官方 API。

const providers = new Map<OnlineProviderId, OnlineMusicProvider>();

// Folium mods register and remove providers at runtime, after the UI first read the list. The version
// lets that UI (through omni, see useOnlineProviderPlatform) notice instead of keeping a stale list.
let registryVersion = 0;
const registryListeners = new Set<() => void>();

const announceRegistryChange = () => {
    registryVersion += 1;
    registryListeners.forEach(listener => listener());
};

export const registerOnlineMusicProvider = (provider: OnlineMusicProvider): void => {
    providers.set(provider.id, provider);
    announceRegistryChange();
};

export const unregisterOnlineMusicProvider = (providerId: OnlineProviderId): void => {
    if (providers.delete(providerId)) announceRegistryChange();
};

/** Bumped by every registration and removal. */
export const getOnlineMusicProviderRegistryVersion = (): number => registryVersion;

/** Calls `listener` after every registration and removal; returns the unsubscribe function. */
export const subscribeOnlineMusicProviderRegistry = (listener: () => void): (() => void) => {
    registryListeners.add(listener);
    return () => {
        registryListeners.delete(listener);
    };
};

export const getOnlineMusicProvider = (providerId: OnlineProviderId): OnlineMusicProvider | null => (
    providers.get(providerId) || null
);

export const listOnlineMusicProviders = (): OnlineMusicProvider[] => Array.from(providers.values());

export const requireOnlineMusicProvider = (providerId: OnlineProviderId): OnlineMusicProvider => {
    const provider = getOnlineMusicProvider(providerId);
    if (!provider) {
        throw new OnlineProviderError('unavailable', `Online music provider is not registered: ${providerId}`, providerId);
    }
    return provider;
};

export const providerSupports = (
    provider: OnlineMusicProvider | null | undefined,
    capability: keyof ProviderCapabilities,
): boolean => Boolean(provider?.capabilities[capability]);

export const getOnlineMusicProviderForSong = (song: SongResult): OnlineMusicProvider | null => {
    const sourceRef = getPlaybackSourceRef(song);
    return sourceRef.kind === 'online' ? getOnlineMusicProvider(sourceRef.providerId) : null;
};

export const canPlayOnlineMusicSong = (song: SongResult): boolean => {
    const provider = getOnlineMusicProviderForSong(song);
    return providerSupports(provider, 'playback') && Boolean(provider?.playback);
};

export const requireOnlineMusicProviderForSong = (song: SongResult): OnlineMusicProvider => {
    const sourceRef = getPlaybackSourceRef(song);
    if (sourceRef.kind !== 'online') {
        throw new OnlineProviderError('unsupported', `Song is not from an online provider: ${sourceRef.kind}`);
    }
    return requireOnlineMusicProvider(sourceRef.providerId);
};

// 四个官方平台 provider（netease / kugou / qq / bodian）已按产品决策移除。
// 在线搜索与播放统一由 LX 音源承担：内置源负责搜索，自定义源负责播放地址与歌词。
registerOnlineMusicProvider(lxProvider);
registerOnlineMusicProvider(lxKgProvider);
registerOnlineMusicProvider(lxWyProvider);
registerOnlineMusicProvider(lxTxProvider);
