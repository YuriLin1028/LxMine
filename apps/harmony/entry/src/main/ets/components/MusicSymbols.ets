export function musicSymbol(icon: Resource): Resource {
  if (icon.id === $r('app.media.ic_download').id) return $r('sys.symbol.arrow_down_circle');
  if (icon.id === $r('app.media.ic_shuffle').id) return $r('sys.symbol.shuffle');
  if (icon.id === $r('app.media.ic_repeat').id) return $r('sys.symbol.repeat');
  if (icon.id === $r('app.media.ic_search').id) return $r('sys.symbol.magnifyingglass');
  if (icon.id === $r('app.media.ic_play').id) return $r('sys.symbol.play_fill');
  if (icon.id === $r('app.media.ic_pause').id) return $r('sys.symbol.pause_fill');
  if (icon.id === $r('app.media.ic_next').id) return $r('sys.symbol.forward_end_fill');
  if (icon.id === $r('app.media.ic_previous').id) return $r('sys.symbol.backward_end_fill');
  if (icon.id === $r('app.media.ic_settings').id) return $r('sys.symbol.gearshape');
  if (icon.id === $r('app.media.ic_library').id) return $r('sys.symbol.square_grid_2x2');
  if (icon.id === $r('app.media.ic_queue').id) return $r('sys.symbol.music_note_list');
  if (icon.id === $r('app.media.ic_down').id) return $r('sys.symbol.chevron_down');
  if (icon.id === $r('app.media.ic_back').id) return $r('sys.symbol.chevron_left');
  if (icon.id === $r('app.media.ic_heart').id) return $r('sys.symbol.heart');
  if (icon.id === $r('app.media.ic_plus').id) return $r('sys.symbol.plus');
  if (icon.id === $r('app.media.ic_import').id) return $r('sys.symbol.square_and_arrow_down');
  if (icon.id === $r('app.media.ic_more').id) return $r('sys.symbol.ellipsis_circle');
  if (icon.id === $r('app.media.refresh').id) return $r('sys.symbol.arrow_clockwise');
  return $r('sys.symbol.music_note_list');
}
