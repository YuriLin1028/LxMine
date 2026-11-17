package com.lxlia.player.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lxlia.player.lx.MusicComments
import com.lxlia.player.lx.SongComment
import com.lxlia.player.lx.SongComments
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private fun relativeTime(ms: Long): String {
    if (ms <= 0) return ""
    val diff = System.currentTimeMillis() - ms
    return when {
        diff < 60_000 -> "刚刚"
        diff < 3_600_000 -> "${diff / 60_000} 分钟前"
        diff < 86_400_000 -> "${diff / 3_600_000} 小时前"
        diff < 604_800_000 -> "${diff / 86_400_000} 天前"
        else -> SimpleDateFormat("yyyy-MM-dd", Locale.CHINA).format(Date(ms))
    }
}

/** 评论浮层：只读取原平台公开评论，不提供登录、点赞或发表入口。 */
@Composable
fun CommentsOverlay(vm: AppViewModel) {
    val song = vm.selected
    var data by remember { mutableStateOf<SongComments?>(null) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var token by remember { mutableStateOf(0) }
    var reloadKey by remember { mutableStateOf(0) }

    LaunchedEffect(song?.key, reloadKey) {
        val current = song
        if (current == null) return@LaunchedEffect
        val mine = ++token
        loading = true
        error = ""
        data = null
        runCatching { kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { MusicComments.fetch(current) } }
            .onSuccess {
                if (mine == token) {
                    data = it
                    loading = false
                }
            }
            .onFailure {
                if (mine == token) {
                    error = it.message ?: "评论读取失败"
                    loading = false
                }
            }
    }

    Box(Modifier.fillMaxSize().background(INK)) {
        Column(Modifier.fillMaxSize()) {
            PageHeader(
                title = song?.name ?: "歌曲评论",
                subtitle = song?.let { it.singer + (data?.let { info -> " · ${info.platform}" } ?: "") } ?: "网络平台评论",
                wide = vm.wide,
                topInset = vm.statusInset,
                backLabel = "返回歌曲",
                onBack = { vm.commentsOpen = false },
            )
            LazyColumn(
                modifier = Modifier.weight(1f).fillMaxWidth(),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(
                    start = if (vm.wide) 32.dp else 20.dp,
                    end = if (vm.wide) 32.dp else 20.dp,
                    top = 6.dp,
                    bottom = vm.bottomInset.dp + 40.dp,
                ),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                val info = data
                if (info != null) {
                    item { CommentsNotice(info.platform) }
                    if (info.hot.isNotEmpty()) {
                        item { SectionHeading("热门评论") }
                        items(info.hot, key = { "hot-${it.id}" }) { comment -> CommentRow(comment) }
                    }
                    if (info.latest.isNotEmpty()) {
                        item { SectionHeading("最新评论") }
                        items(info.latest, key = { "new-${it.id}" }) { comment -> CommentRow(comment) }
                    }
                    item {
                        Text(
                            "共 ${info.total} 条评论，仅显示近期公开内容",
                            fontSize = 11.sp,
                            color = MUTED,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
                        )
                    }
                } else {
                    item {
                        Column(
                            modifier = Modifier.fillMaxWidth().height(280.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center,
                        ) {
                            when {
                                loading -> {
                                    CircularProgressIndicator(color = ACCENT, strokeWidth = 2.5.dp, modifier = Modifier.size(34.dp))
                                    Text("正在读取评论…", fontSize = 13.sp, color = MUTED, modifier = Modifier.padding(top = 14.dp))
                                }
                                error.isNotEmpty() -> {
                                    Text(error, fontSize = 13.sp, color = Color(0xFFFFB4B4), textAlign = TextAlign.Center, maxLines = 3)
                                    PillButton("重试", filled = false, modifier = Modifier.padding(top = 14.dp), onClick = { reloadKey++ })
                                }
                                else -> {
                                    AssetIcon("ic_comment_official.svg", size = 30.dp, tint = MUTED)
                                    Text("还没有评论", fontSize = 13.sp, color = MUTED, modifier = Modifier.padding(top = 14.dp))
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SectionHeading(text: String) {
    Text(text, fontSize = 18.sp, color = TEXT, fontWeight = androidx.compose.ui.text.font.FontWeight.Medium, modifier = Modifier.fillMaxWidth())
}

@Composable
private fun CommentsNotice(platform: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Color(0x0DFFFFFF))
            .padding(14.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        AssetIcon("ic_comment_official.svg", size = 18.dp, tint = MUTED)
        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text("评论来自$platform", fontSize = 12.sp, color = TEXT)
            Text("仅供浏览，发表评论请前往原平台", fontSize = 10.sp, color = MUTED)
        }
    }
}

@Composable
private fun CommentRow(comment: SongComment) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(
                modifier = Modifier.size(40.dp).clip(CircleShape).background(Color(0x16FFFFFF)),
                contentAlignment = Alignment.Center,
            ) {
                if (comment.avatar.isNotEmpty()) {
                    RemoteImage(comment.avatar, modifier = Modifier.size(40.dp), contentScale = ContentScale.Crop)
                } else {
                    Text(comment.nick.take(1), fontSize = 15.sp, color = ACCENT)
                }
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        comment.nick,
                        fontSize = 13.sp,
                        color = ACCENT,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    Text(relativeTime(comment.timeMs), fontSize = 10.sp, color = MUTED, maxLines = 1)
                }
                Text(
                    comment.content.ifEmpty { "（图片评论）" },
                    fontSize = 14.sp,
                    color = TEXT,
                    lineHeight = 21.sp,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (comment.location.isNotEmpty()) {
                        Text(comment.location, fontSize = 10.sp, color = MUTED, maxLines = 1)
                    }
                    Spacer(Modifier.weight(1f))
                    AssetIcon("ic_heart.svg", size = 12.dp, tint = MUTED)
                    Text(if (comment.liked > 0) "${comment.liked}" else "赞", fontSize = 10.sp, color = MUTED)
                }
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(Color(0x12FFFFFF)))
    }
}
