import React, { useCallback, useEffect, useState } from 'react';
import { Check, FileUp, Loader2, Trash2 } from 'lucide-react';
import { useLxLibraryStore } from '../../../stores/useLxLibraryStore';
import {
    getActiveLxSourceId,
    importLxSourceFile,
    importLxSourceText,
    listLxSources,
    removeLxSources,
    setActiveLxSource,
    type LxSourceInfo,
} from '../../../services/lxSource';

// src/components/modal/settings/LxSourcesSettingsSubview.tsx
// 设置里的「音源」页：导入 / 启用 / 删除 LX 自定义源。
// 取代了原先的连接与集成（Discord / OBS / 歌词接口 / Navidrome 等）页面。

const LxSourcesSettingsSubview: React.FC = () => {
    const [sources, setSources] = useState<LxSourceInfo[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [pasteText, setPasteText] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');

    const refresh = useCallback(async () => {
        setSources(await listLxSources());
        setActiveId(await getActiveLxSourceId());
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const importFromFile = async () => {
        setBusy(true);
        setMessage('');
        try {
            const imported = await importLxSourceFile();
            if (imported) {
                setMessage(`已导入「${imported.name}」`);
                await refresh();
            }
        } catch (error) {
            setMessage(`导入失败：${(error as Error).message}`);
        } finally {
            setBusy(false);
        }
    };

    const importFromText = async () => {
        if (!pasteText.trim()) return;
        setBusy(true);
        setMessage('');
        try {
            const imported = await importLxSourceText(pasteText);
            if (imported) {
                setMessage(`已导入「${imported.name}」`);
                setPasteText('');
                await refresh();
            }
        } catch (error) {
            setMessage(`导入失败：${(error as Error).message}`);
        } finally {
            setBusy(false);
        }
    };

    const activate = async (source: LxSourceInfo) => {
        setBusy(true);
        try {
            await setActiveLxSource(source.id);
            await refresh();
            setMessage(`已启用「${source.name}」`);
        } catch (error) {
            setMessage(`启用失败：${(error as Error).message}`);
        } finally {
            setBusy(false);
        }
    };

    const remove = async (source: LxSourceInfo) => {
        setBusy(true);
        try {
            await removeLxSources([source.id]);
            await refresh();
            setMessage(`已删除「${source.name}」`);
        } catch (error) {
            setMessage(`删除失败：${(error as Error).message}`);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-4 text-left">
            <div>
                <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>音源</h2>
                <button type="button" className="mt-3 rounded-xl bg-white/10 px-4 py-2 text-sm" onClick={() => useLxLibraryStore.getState().open()}>我的歌单 · 导入其他平台歌单</button>
                <p className="text-[11px] opacity-50 mt-1" style={{ color: 'var(--text-secondary)' }}>
                    搜索使用内置源；播放地址由导入并启用的 LX 兼容 JS 音源提供。
                </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => void importFromFile()}
                    className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10 disabled:opacity-50"
                    style={{ color: 'var(--text-primary)' }}
                >
                    <FileUp size={14} />
                    从文件导入
                </button>
                {busy && <Loader2 size={14} className="animate-spin opacity-60" />}
            </div>

            <div className="space-y-2">
                {sources.length === 0 && (
                    <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-xs opacity-50" style={{ color: 'var(--text-secondary)' }}>
                        还没有自定义源。没有源时可以搜索，但无法播放。
                    </div>
                )}
                {sources.map(source => (
                    <div key={source.id} className="flex items-start justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-primary)' }}>
                                <span className="truncate">{source.name}</span>
                                {activeId === source.id && (
                                    <span className="flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-400">
                                        <Check size={10} /> 已启用
                                    </span>
                                )}
                            </div>
                            <div className="mt-0.5 truncate text-[11px] opacity-45" style={{ color: 'var(--text-secondary)' }}>
                                {source.version ? `v${source.version}` : '—'}
                                {source.author ? ` · ${source.author}` : ''}
                                {source.description ? ` · ${source.description}` : ''}
                            </div>
                        </div>
                        <div className="ml-3 flex shrink-0 gap-2">
                            <button
                                type="button"
                                disabled={busy || activeId === source.id}
                                onClick={() => void activate(source)}
                                className="rounded-lg bg-white/10 px-2.5 py-1 text-xs hover:bg-white/15 disabled:opacity-40"
                                style={{ color: 'var(--text-primary)' }}
                            >
                                启用
                            </button>
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => void remove(source)}
                                className="flex items-center gap-1 rounded-lg bg-white/5 px-2.5 py-1 text-xs opacity-70 hover:opacity-100 disabled:opacity-40"
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                <Trash2 size={12} /> 删除
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <div>
                <div className="text-xs opacity-50 mb-1" style={{ color: 'var(--text-secondary)' }}>或者直接粘贴脚本内容</div>
                <textarea
                    value={pasteText}
                    onChange={event => setPasteText(event.target.value)}
                    placeholder={'/*!\n * @name ...\n */\nlx.on(lx.EVENT_NAMES.request, ...)'}
                    className="h-28 w-full resize-none rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-[11px] outline-none focus:border-white/20"
                    style={{ color: 'var(--text-primary)' }}
                />
                <button
                    type="button"
                    disabled={busy || !pasteText.trim()}
                    onClick={() => void importFromText()}
                    className="mt-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs hover:bg-white/15 disabled:opacity-40"
                    style={{ color: 'var(--text-primary)' }}
                >
                    导入粘贴内容
                </button>
            </div>

            {message && (
                <div className="rounded-lg bg-white/5 px-3 py-2 text-xs" style={{ color: 'var(--text-secondary)' }}>{message}</div>
            )}
        </div>
    );
};

export default LxSourcesSettingsSubview;
