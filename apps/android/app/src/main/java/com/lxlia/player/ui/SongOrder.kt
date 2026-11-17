package com.lxlia.player.ui

import com.lxlia.player.model.Song
import java.text.Collator
import java.util.Locale

/** 所有歌曲列表共用的展示顺序：只改变展示，不写回歌单本身。 */
fun orderSongList(songs: List<Song>, mode: String, manual: List<String>, query: String = ""): List<Song> {
    val keyword = query.trim().lowercase()
    val list = if (keyword.isNotEmpty()) {
        songs.filter { "${it.name} ${it.singer} ${it.albumName}".lowercase().contains(keyword) }
    } else {
        songs.toMutableList()
    }.toMutableList()
    val collator = Collator.getInstance(Locale.SIMPLIFIED_CHINESE)
    when {
        mode == "manual" && manual.isNotEmpty() -> {
            val rank = manual.withIndex().associate { it.value to it.index }
            list.sortBy { rank[it.key] ?: 999999 }
        }
        mode == "name" -> list.sortWith { a, b -> collator.compare(a.name, b.name) }
        mode == "artist" -> list.sortWith { a, b ->
            val bySinger = collator.compare(a.singer, b.singer)
            if (bySinger != 0) bySinger else collator.compare(a.name, b.name)
        }
        mode == "album" -> list.sortWith { a, b ->
            val byAlbum = collator.compare(a.albumName, b.albumName)
            if (byAlbum != 0) byAlbum else collator.compare(a.name, b.name)
        }
    }
    return list
}
