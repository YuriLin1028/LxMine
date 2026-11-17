package com.lxlia.player.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.lxlia.player.LxMineApp

/** AppViewModel 需要 Application 级别的装配，用最小工厂注入。 */
class AppViewModelProvider(private val app: LxMineApp) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = AppViewModel(app) as T
}
