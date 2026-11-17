package com.lxlia.player.ui

import androidx.compose.runtime.State
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.layout
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.Dp

/** Retain controls during the fade, then remove their placement/hit targets. */
internal fun Modifier.playerChromeVisibility(
    visible: Boolean,
    progress: State<Float>,
    hiddenOffset: Dp,
    gateInput: Boolean = true,
): Modifier = this
    .layout { measurable, constraints ->
        val child = measurable.measure(constraints)
        layout(child.width, child.height) {
            if (visible || progress.value > 0.001f) child.place(0, 0)
        }
    }
    .graphicsLayer {
        alpha = progress.value
        translationY = (1f - progress.value) * hiddenOffset.toPx()
    }
    .then(if (!visible) Modifier.clearAndSetSemantics {} else Modifier)
    .then(if (gateInput) Modifier.blockHiddenPlayerChrome(visible) else Modifier)

internal fun Modifier.blockHiddenPlayerChrome(visible: Boolean): Modifier =
    if (visible) this else pointerInput(Unit) {
        awaitPointerEventScope {
            while (true) awaitPointerEvent(PointerEventPass.Initial).changes.forEach { it.consume() }
        }
    }
