package com.lxlia.player.model

const val MINE_STAGE_REVISION = "eda03b36831b7ed9"

data class MineRadioMode(val id: String, val label: String)

val MINE_RADIO_MODES: List<MineRadioMode> = listOf(
    MineRadioMode("smart-auto", "随声绘色"),
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
    MineRadioMode("folia-partita", "Folia · 云阶"),
    MineRadioMode("folia-pendolo", "Folia · Pendolo"),
    MineRadioMode("folia-diorama", "Folia · 镜台"),
    MineRadioMode("folia-fume", "Folia · Fume"),
    MineRadioMode("folia-sonnet", "Folia · 商籁"),
    MineRadioMode("folia-tempera", "Folia · 凝彩"),
    MineRadioMode("folia-lumiere", "Folia · 绘光"),
    MineRadioMode("folia-monet", "Folia · Monet"),
    MineRadioMode("folia-cadenza", "Folia · Mindscape"),
    MineRadioMode("folia-claddagh", "Folia · Claddagh"),
    MineRadioMode("folia-tilt", "Folia · Tilt"),
    MineRadioMode("folia-classic", "Folia · Luminous"),
    MineRadioMode("folia-cappella", "Folia · Cappella"),
)
