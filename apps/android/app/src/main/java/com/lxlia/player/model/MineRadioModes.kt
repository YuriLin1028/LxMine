package com.lxlia.player.model

const val MINE_STAGE_REVISION = "ba49645ba54cd745"

data class MineRadioMode(val id: String, val label: String)

val MINE_RADIO_MODES: List<MineRadioMode> = listOf(
    MineRadioMode("off", "关闭动效"),
    MineRadioMode("mine-0", "emily专辑封面"),
    MineRadioMode("mine-1", "滚筒"),
    MineRadioMode("mine-2", "星球"),
    MineRadioMode("mine-3", "虚空"),
    MineRadioMode("mine-4", "唱片"),
    MineRadioMode("mine-5", "星河"),
    MineRadioMode("mine-6", "安魂"),
    MineRadioMode("mine-7", "音域回响 · 地形"),
    MineRadioMode("mine-8", "音域回响 · 工坊"),
    MineRadioMode("mine-9", "月蚀圣环"),
    MineRadioMode("mine-10", "雨幕霓虹"),
    MineRadioMode("mine-11", "折光蝶群"),
    MineRadioMode("mine-12", "深海绽放"),
)
