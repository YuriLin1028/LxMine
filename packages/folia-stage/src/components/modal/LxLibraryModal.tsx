import React, { useEffect, useState } from 'react';
import { Download, Heart, ListMusic, Play, Plus, Trash2, Upload, X } from 'lucide-react';
import type { SongResult } from '../../types';
import { useLxLibraryStore } from '../../stores/useLxLibraryStore';
import { usePlaybackStore } from '../../stores/usePlaybackStore';
import { addLxSong, getLxPlaylists, importLxPlaylists, lxPlaybackSong, lxSongKey, newLxPlaylist, saveLxPlaylists, toPortableLxSong, type LxPlaylist, type LxSource } from '../../services/lxLibrary';

// src/components/modal/LxLibraryModal.tsx — portable playlists and import without a platform account.
interface Props { onPlay: (song: SongResult, queue?: SongResult[]) => void | Promise<void>; }
const button = 'rounded-xl px-3 py-2 text-xs hover:bg-white/10 disabled:opacity-40';
const LxLibraryModal: React.FC<Props> = ({ onPlay }) => {
    const { isOpen, close } = useLxLibraryStore();
    const currentSong = usePlaybackStore(state => state.currentSong);
    const [lists, setLists] = useState<LxPlaylist[]>([]);
    const [selected, setSelected] = useState('');
    const [input, setInput] = useState('');
    const [source, setSource] = useState<LxSource>('wy');
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const [name, setName] = useState('');
    const [showImport, setShowImport] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    useEffect(() => {
        if (!isOpen) return;
        const refresh = () => { void getLxPlaylists().then(setLists).catch(error => setMessage(String(error))); };
        refresh(); window.addEventListener('lxlia-library-changed', refresh);
        const key = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
        window.addEventListener('keydown', key);
        return () => { window.removeEventListener('lxlia-library-changed', refresh); window.removeEventListener('keydown', key); };
    }, [isOpen, close]);
    if (!isOpen) return null;
    const list = lists.find(item => item.id === selected);
    const portableCurrent = currentSong ? toPortableLxSong(currentSong) : null;
    const save = async (next: LxPlaylist[]) => { await saveLxPlaylists(next); setLists(next); };
    const run = async (action: () => Promise<void>) => {
        setBusy(true); setMessage('');
        try { await action(); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
    };
    const importText = (text: string) => run(async () => {
        const next = await importLxPlaylists(text, source); setLists(next); setSelected(next.at(-1)?.id ?? '');
        setShowImport(false); setInput(''); setMessage('歌单已导入，点击歌曲即可播放');
    });
    const exportLists = () => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(lists, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = 'Lxlia-playlists.json'; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    return <div className="fixed inset-0 z-[2450] flex items-center justify-center bg-black/65 p-5 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="我的歌单">
        <div className="flex h-[78vh] w-[960px] max-w-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#19191f] text-zinc-100 shadow-2xl">
            <header className="flex items-center gap-3 border-b border-white/8 px-6 py-5">
                <ListMusic size={22} className="text-amber-200" /><h2 className="flex-1 text-xl">我的歌单</h2>
                <button className={button} onClick={() => setShowImport(!showImport)}><Upload size={14} className="mr-2 inline" />导入歌单</button>
                <button className={button} onClick={exportLists} disabled={!lists.length}><Download size={14} className="mr-2 inline" />导出</button>
                <button className={button} aria-label="关闭歌单" onClick={close}><X size={20} /></button>
            </header>
            {showImport && <section className="space-y-3 border-b border-white/8 px-6 py-4">
                <p className="text-xs text-zinc-400">网易云 / QQ / 酷我歌单链接，或 LX 歌单 JSON。歌曲播放使用你启用的自定义源。</p>
                <div className="flex gap-3"><select aria-label="导入平台" className="rounded-lg bg-zinc-800 p-2 text-xs" value={source} onChange={e => setSource(e.target.value as LxSource)}>
                    <option value="wy">网易云</option><option value="tx">QQ 音乐</option><option value="kw">酷我</option><option value="kg">酷狗 JSON</option>
                </select><label className={`${button} cursor-pointer bg-white/5`}>选择 JSON 文件<input className="hidden" type="file" accept=".json,.txt" disabled={busy} onChange={e => {
                    const file = e.target.files?.[0]; if (!file) return;
                    if (file.size > 8 * 1024 * 1024) { setMessage('文件超过 8 MB'); return; }
                    void file.text().then(importText).catch(error => setMessage(String(error))); e.target.value = '';
                }} /></label></div>
                <textarea aria-label="歌单链接或 JSON" className="h-20 w-full resize-none rounded-xl bg-black/25 p-3 text-xs outline-none focus:ring-1 focus:ring-amber-200/50" placeholder="粘贴分享链接、歌单 ID 或 JSON…" value={input} onChange={e => setInput(e.target.value)} />
                <button className={`${button} bg-amber-200 !text-zinc-900`} disabled={busy || !input.trim()} onClick={() => void importText(input)}>{busy ? '正在导入…' : '导入'}</button>
            </section>}
            {message && <p role="status" className="px-6 py-3 text-xs text-amber-200">{message}</p>}
            <div className="flex min-h-0 flex-1">
                <aside className="w-[225px] shrink-0 space-y-2 overflow-y-auto border-r border-white/8 p-4">
                    <form className="flex gap-1 pb-3" onSubmit={e => { e.preventDefault(); if (!name.trim()) return; const added = newLxPlaylist(name.trim()); void run(async () => { await save([...lists, added]); setSelected(added.id); setName(''); }); }}>
                        <input aria-label="新歌单名称" value={name} onChange={e => setName(e.target.value)} placeholder="新建歌单" className="min-w-0 flex-1 rounded-lg bg-white/5 px-2 text-xs outline-none" />
                        <button className={button} aria-label="创建歌单"><Plus size={15} /></button>
                    </form>
                    {lists.map(item => <button key={item.id} onClick={() => { setSelected(item.id); setConfirmDelete(false); }} className={`w-full rounded-xl px-3 py-3 text-left ${selected === item.id ? 'bg-white/10' : 'hover:bg-white/5'}`}>
                        <div className="truncate text-sm">{item.isFavorite && <Heart size={12} className="mr-2 inline text-amber-200" />}{item.name}</div><div className="mt-1 text-[11px] text-zinc-500">{item.songs.length} 首</div>
                    </button>)}
                    {!lists.length && <p className="py-8 text-xs leading-6 text-zinc-500">导入平台歌单，或新建一个歌单收藏正在听的歌。</p>}
                </aside>
                <section className="min-w-0 flex-1 overflow-y-auto p-6">
                    {list ? <>
                        <div className="mb-6 flex items-start gap-3"><div className="min-w-0 flex-1"><h3 className="truncate text-2xl">{list.name}</h3><p className="mt-2 text-xs text-zinc-500">{list.songs.length} 首 · 本机保存，支持局域网同步</p></div>
                            <button className={button} disabled={!list.songs.length} onClick={() => { const queue = list.songs.map(lxPlaybackSong); void onPlay(queue[0], queue); close(); }}><Play size={16} /></button>
                            <button aria-label="删除歌单" className={button} onClick={() => setConfirmDelete(true)}><Trash2 size={16} /></button></div>
                        {confirmDelete && <div className="mb-4 flex items-center gap-3 rounded-xl bg-red-300/10 p-3 text-xs"><span className="flex-1">删除「{list.name}」？</span><button className={button} onClick={() => setConfirmDelete(false)}>取消</button><button className={button} onClick={() => void run(async () => { await save(lists.filter(item => item.id !== list.id)); setSelected(''); setConfirmDelete(false); })}>确认删除</button></div>}
                        {portableCurrent && <button className={`${button} mb-4 bg-white/5 text-amber-200`} onClick={() => void run(async () => { await save(lists.map(item => item.id === list.id ? addLxSong(item, portableCurrent) : item)); setMessage('已添加当前歌曲'); })}>＋ 收藏当前歌曲「{portableCurrent.name}」</button>}
                        {list.songs.map((song, index) => <div key={lxSongKey(song)} className="group flex items-center gap-3 rounded-xl px-2 py-3 hover:bg-white/5">
                            <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => { void onPlay(lxPlaybackSong(song), list.songs.map(lxPlaybackSong)); close(); }}>
                                <span className="w-5 text-xs text-zinc-600">{index + 1}</span>{song.coverUrl && <img src={song.coverUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />}
                                <div className="min-w-0 flex-1"><div className="truncate text-sm">{song.name}</div><div className="mt-1 truncate text-xs text-zinc-500">{song.singer} · {song.albumName}</div></div>
                            </button><button aria-label={`移除${song.name}`} className={`${button} opacity-0 group-hover:opacity-100 focus:opacity-100`} onClick={() => void run(async () => {
                                const songs = list.songs.filter(item => lxSongKey(item) !== lxSongKey(song)); await save(lists.map(item => item.id === list.id ? { ...item, songs, songIds: songs.map(lxSongKey), updatedAt: Date.now() } : item));
                            })}><X size={14} /></button>
                        </div>)}
                    </> : <div className="flex h-full flex-col items-center justify-center gap-4 text-zinc-500"><ListMusic size={44} strokeWidth={1} /><p className="text-sm">把喜欢的声音放在一起</p><button className={`${button} text-amber-200`} onClick={() => setShowImport(true)}>导入我的歌单</button></div>}
                </section>
            </div>
        </div>
    </div>;
};
export default LxLibraryModal;
