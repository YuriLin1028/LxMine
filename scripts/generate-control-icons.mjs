import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const harmonyDir = path.join(root, 'apps/harmony/entry/src/main/resources/base/media');
const androidDir = path.join(root, 'apps/android/app/src/main/assets/icons');
const desktopManifest = path.join(root, 'apps/desktop/public/lxmine/icons-manifest.json');

const mono = (body, rule = 'evenodd') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"><g fill="#FFFFFF" fill-rule="${rule}" clip-rule="${rule}">${body}</g></svg>`;

const colored = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">${body}</svg>`;

// Sculpted Glacial-Studio 24x24 filled vector iconography (zero thin-stroke tinting bugs; crisp at all DPIs).
const ICONS = {
  // 1. Navigation: Home (sculpted pavilion roof + rounded sanctuary body + warm pill doorway cutout)
  ic_home: mono(
    `<path d="M10.72 3.28a1.9 1.9 0 0 1 2.56 0l7.15 6.55c.36.33.57.8.57 1.29v7.38A2.5 2.5 0 0 1 18.5 21h-13A2.5 2.5 0 0 1 3 18.5v-7.38c0-.49.21-.96.57-1.29l7.15-6.55ZM12 5.22 5 11.63v6.87c0 .28.22.5.5.5h3.75v-4.25a2.75 2.75 0 1 1 5.5 0V19h3.75a.5.5 0 0 0 .5-.5v-6.87L12 5.22Zm-1.25 9.53a1.25 1.25 0 1 1 2.5 0V19h-2.5v-4.25Z"/>`
  ),

  // 2. Navigation: Library / 曲库 (stacked vinyl-sleeve cards + sculpted play prism inside front card)
  ic_library: mono(
    `<path d="M6.5 3A1.5 1.5 0 0 1 8 1.5h8A1.5 1.5 0 0 1 17.5 3a.75.75 0 0 1-.75.75h-9.5A.75.75 0 0 1 6.5 3ZM4.75 5.75A1.25 1.25 0 0 1 6 4.5h12a1.25 1.25 0 0 1 1.25 1.25.75.75 0 0 1-.75.75H5.5a.75.75 0 0 1-.75-.75ZM5.75 8h12.5A2.75 2.75 0 0 1 21 10.75v7.5A2.75 2.75 0 0 1 18.25 21H5.75A2.75 2.75 0 0 1 3 18.25v-7.5A2.75 2.75 0 0 1 5.75 8Zm4.65 3.42a.95.95 0 0 0-1.45.81v4.54a.95.95 0 0 0 1.45.81l3.78-2.27a.95.95 0 0 0 0-1.62l-3.78-2.27Z"/>`
  ),

  // 3. Navigation: Settings (sleek minimalist 3-track acoustic sliders — clean & modern)
  ic_settings: mono(
    `<path d="M4.2 6.8a.9.9 0 0 1 .9-.9h4.65a2.35 2.35 0 0 1 4.5 0h4.65a.9.9 0 1 1 0 1.8h-4.65a2.35 2.35 0 0 1-4.5 0H5.1a.9.9 0 0 1-.9-.9Zm6.9 0a.9.9 0 1 0 1.8 0 .9.9 0 0 0-1.8 0ZM4.2 12a.9.9 0 0 1 .9-.9h1.15a2.35 2.35 0 0 1 4.5 0h8.15a.9.9 0 1 1 0 1.8h-8.15a2.35 2.35 0 0 1-4.5 0H5.1a.9.9 0 0 1-.9-.9Zm3.4 0a.9.9 0 1 0 1.8 0 .9.9 0 0 0-1.8 0ZM4.2 17.2a.9.9 0 0 1 .9-.9h8.15a2.35 2.35 0 0 1 4.5 0h1.15a.9.9 0 1 1 0 1.8h-1.15a2.35 2.35 0 0 1-4.5 0H5.1a.9.9 0 0 1-.9-.9Zm10.4 0a.9.9 0 1 0 1.8 0 .9.9 0 0 0-1.8 0Z"/>`
  ),

  // 4. Transport: Play (optically centered sculpted rounded prism)
  ic_play: mono(
    `<path d="M7.35 4.86C7.35 3.63 8.7 2.88 9.76 3.52l10.02 6.08c1.01.61 1.01 2.09 0 2.7L9.76 18.38c-1.06.64-2.41-.11-2.41-1.34V4.86Z" transform="translate(0 1.05)"/>`
  ),

  // 5. Transport: Pause (twin sculpted stadium pillars)
  ic_pause: mono(
    `<path d="M6.75 4.5A2.25 2.25 0 0 1 9 6.75v10.5a2.25 2.25 0 1 1-4.5 0V6.75A2.25 2.25 0 0 1 6.75 4.5Zm10.5 0a2.25 2.25 0 0 1 2.25 2.25v10.5a2.25 2.25 0 1 1-4.5 0V6.75a2.25 2.25 0 0 1 2.25-2.25Z"/>`
  ),

  // 6. Transport: Next (sculpted prism + rounded sonic bar)
  ic_next: mono(
    `<path d="M5.2 5.68c0-1.08 1.18-1.74 2.11-1.17l8.22 5.06a1.38 1.38 0 0 1 0 2.34l-8.22 5.06c-.93.57-2.11-.09-2.11-1.17V5.68Zm13.05-.43a1.25 1.25 0 0 1 1.25 1.25v11a1.25 1.25 0 1 1-2.5 0v-11a1.25 1.25 0 0 1 1.25-1.25Z" transform="translate(0 1.25)"/>`
  ),

  // 7. Transport: Previous (rounded sonic bar + sculpted reverse prism)
  ic_previous: mono(
    `<path d="M5.75 5.25A1.25 1.25 0 0 1 7 6.5v11a1.25 1.25 0 1 1-2.5 0v-11a1.25 1.25 0 0 1 1.25-1.25Zm13.05.43v10.12c0 1.08-1.18 1.74-2.11 1.17l-8.22-5.06a1.38 1.38 0 0 1 0-2.34l8.22-5.06c.93-.57 2.11.09 2.11 1.17Z" transform="translate(0 1.25)"/>`
  ),

  // 8. Play Mode: Repeat All (fluid stadium loop with twin directional arrowheads)
  ic_repeat: mono(
    `<path d="M16.72 3.22a.9.9 0 0 1 1.28 0l2.45 2.45a.9.9 0 0 1 0 1.28l-2.45 2.45a.9.9 0 1 1-1.28-1.28l.91-.91H8.25A3.25 3.25 0 0 0 5 10.46v1.29a.9.9 0 1 1-1.8 0v-1.29A5.05 5.05 0 0 1 8.25 5.4h9.38l-.91-.9a.9.9 0 0 1 0-1.28Zm3.18 8.13a.9.9 0 0 1 .9.9v1.29a5.05 5.05 0 0 1-5.05 5.06H6.37l.91.9a.9.9 0 1 1-1.28 1.28l-2.45-2.45a.9.9 0 0 1 0-1.28l2.45-2.45a.9.9 0 1 1 1.28 1.28l-.91.91h9.38A3.25 3.25 0 0 0 19 13.54v-1.29a.9.9 0 0 1 .9-.9Z"/>`
  ),

  // 9. Play Mode: Repeat One (fluid stadium loop + crisp centered '1' pill)
  ic_repeat_one: mono(
    `<path d="M16.72 3.22a.9.9 0 0 1 1.28 0l2.45 2.45a.9.9 0 0 1 0 1.28l-2.45 2.45a.9.9 0 1 1-1.28-1.28l.91-.91H8.25A3.25 3.25 0 0 0 5 10.46v1.29a.9.9 0 1 1-1.8 0v-1.29A5.05 5.05 0 0 1 8.25 5.4h9.38l-.91-.9a.9.9 0 0 1 0-1.28Zm3.18 8.13a.9.9 0 0 1 .9.9v1.29a5.05 5.05 0 0 1-5.05 5.06H6.37l.91.9a.9.9 0 1 1-1.28 1.28l-2.45-2.45a.9.9 0 0 1 0-1.28l2.45-2.45a.9.9 0 1 1 1.28 1.28l-.91.91h9.38A3.25 3.25 0 0 0 19 13.54v-1.29a.9.9 0 0 1 .9-.9ZM12.35 8.85a.8.8 0 0 1 .8.8v4.7a.8.8 0 1 1-1.6 0v-3.15l-.68.42a.75.75 0 1 1-.79-1.27l1.45-.9a.8.8 0 0 1 .82-.6Z"/>`
  ),

  // 10. Play Mode: Shuffle (smooth braided S-curve ribbons with clean crossing gap + twin arrowheads)
  ic_shuffle: mono(
    `<path d="M17.22 3.72a.9.9 0 0 1 1.28 0l2.25 2.25a.9.9 0 0 1 0 1.28l-2.25 2.25a.9.9 0 1 1-1.28-1.28l.71-.72h-1.36a3.4 3.4 0 0 0-2.72 1.36l-4.2 5.6A5.2 5.2 0 0 1 5.49 16.5H3.9a.9.9 0 1 1 0-1.8h1.59a3.4 3.4 0 0 0 2.72-1.36l4.2-5.6A5.2 5.2 0 0 1 16.57 5.7h1.36l-.71-.7a.9.9 0 0 1 0-1.28ZM3.9 5.7h1.59a5.2 5.2 0 0 1 4.16 2.08l.76 1.01a.9.9 0 1 1-1.44 1.08l-.76-1.01A3.4 3.4 0 0 0 5.49 7.5H3.9a.9.9 0 0 1 0-1.8Zm9.69 8.43a.9.9 0 0 1 1.26.18l.76 1.01a3.4 3.4 0 0 0 2.72 1.38h.96l-.71-.72a.9.9 0 1 1 1.28-1.28l2.25 2.25a.9.9 0 0 1 0 1.28l-2.25 2.25a.9.9 0 1 1-1.28-1.28l.71-.7h-.96a5.2 5.2 0 0 1-4.16-2.08l-.76-1.01a.9.9 0 0 1 .18-1.28Z"/>`
  ),

  // 11. Play Mode: Sequential Order (3 rounded rhythmic bars + sculpted forwardprism)
  ic_order_seq: mono(
    `<path d="M4 5.75A.95.95 0 0 1 4.95 4.8h14.1a.95.95 0 1 1 0 1.9H4.95A.95.95 0 0 1 4 5.75Zm0 5.5a.95.95 0 0 1 .95-.95h10.1a.95.95 0 1 1 0 1.9H4.95a.95.95 0 0 1-.95-.95Zm0 5.5a.95.95 0 0 1 .95-.95h7.6a.95.95 0 1 1 0 1.9h-7.6a.95.95 0 0 1-.95-.95Zm12.05-2.63c0-.72.79-1.16 1.4-.78l3.7 2.28a.92.92 0 0 1 0 1.56l-3.7 2.28c-.61.38-1.4-.06-1.4-.78v-4.56Z"/>`
  ),

  // 12. Queue / 播放队列 (sculpted beamed note + 3 harmonic capsule lines)
  ic_queue: mono(
    `<path d="M16.25 3.6a.95.95 0 0 1 1.16-.92l3.1.78a.95.95 0 0 1 .72.92v1.65a.95.95 0 0 1-1.18.92l-1.9-.48v8.03a3.25 3.25 0 1 1-1.9-2.96V3.6ZM3.75 6.25a.95.95 0 0 1 .95-.95h7.6a.95.95 0 1 1 0 1.9H4.7a.95.95 0 0 1-.95-.95Zm0 5.25a.95.95 0 0 1 .95-.95h7.6a.95.95 0 1 1 0 1.9H4.7a.95.95 0 0 1-.95-.95Zm0 5.25a.95.95 0 0 1 .95-.95h5.1a.95.95 0 1 1 0 1.9H4.7a.95.95 0 0 1-.95-.95Z"/>`
  ),

  // 13. Heart Outline (balanced organic Bezier heart contour)
  ic_heart: mono(
    `<path d="M12 5.74C10.17 3.92 7.18 3.77 5.2 5.66c-2.06 1.96-2.15 5.23-.26 7.36 1.57 1.77 5.24 4.98 6.4 5.95.38.32.94.32 1.32 0 1.16-.97 4.83-4.18 6.4-5.95 1.89-2.13 1.8-5.4-.26-7.36-1.98-1.89-4.97-1.74-6.8.08Zm-.67 2.02a.95.95 0 0 0 1.34 0l.56-.58c1.19-1.22 3.14-1.32 4.41-.11 1.32 1.26 1.38 3.35.15 4.73-1.25 1.4-4.27 4.05-5.79 5.34-1.52-1.29-4.54-3.94-5.79-5.34-1.23-1.38-1.17-3.47.15-4.73 1.27-1.21 3.22-1.11 4.41.11l.56.58Z"/>`
  ),

  // 14. Heart Filled (luminous ruby #FF4D5A with subtle top-left glass specular crescent)
  ic_heart_fill: colored(
    `<path d="M12 5.82C10.18 3.94 7.16 3.78 5.16 5.69c-2.08 1.98-2.17 5.28-.26 7.43 1.59 1.79 5.29 5.02 6.44 5.99.38.32.94.32 1.32 0 1.15-.97 4.85-4.2 6.44-5.99 1.91-2.15 1.82-5.45-.26-7.43-2-1.91-5.02-1.75-6.84.13Z" fill="#FF4D5A"/><path d="M7.6 7.25a2.6 2.6 0 0 0-1.55 2.4.65.65 0 0 1-1.3 0 3.9 3.9 0 0 1 2.33-3.58.65.65 0 1 1 .52 1.18Z" fill="#FFFFFF" fill-opacity="0.34"/>`
  ),

  // 15. Download (sculpted downward arrow + cradled glass tray arc)
  ic_download: mono(
    `<path d="M12 3.25a.95.95 0 0 1 .95.95v8.56l2.42-2.42a.95.95 0 1 1 1.34 1.34l-4.04 4.04a.95.95 0 0 1-1.34 0L7.29 11.68a.95.95 0 1 1 1.34-1.34l2.42 2.42V4.2a.95.95 0 0 1 .95-.95ZM4.45 15.4a.95.95 0 0 1 .95.95v1.15c0 .75.6 1.35 1.35 1.35h10.5c.75 0 1.35-.6 1.35-1.35v-1.15a.95.95 0 1 1 1.9 0v1.15A3.25 3.25 0 0 1 17.25 20.75H6.75A3.25 3.25 0 0 1 3.5 17.5v-1.15a.95.95 0 0 1 .95-.95Z"/>`
  ),

  // 16. Search (restored original clean thin magnifying glass — crisp evenodd contour, zero inner glint)
  ic_search: mono(
    `<path d="M10.5 3.1a7.4 7.4 0 1 0 4.56 13.23l4.2 4.2a.9.9 0 0 0 1.28-1.27l-4.2-4.2A7.4 7.4 0 0 0 10.5 3.1Zm-5.6 7.4a5.6 5.6 0 1 1 11.2 0 5.6 5.6 0 0 1-11.2 0Z"/>`
  ),

  // 17. Back Chevron (crisp sculpted left chevron)
  ic_back: mono(
    `<path d="M14.78 4.97a1.05 1.05 0 0 1 0 1.48L9.23 12l5.55 5.55a1.05 1.05 0 1 1-1.48 1.48l-6.3-6.29a1.05 1.05 0 0 1 0-1.48l6.3-6.29a1.05 1.05 0 0 1 1.48 0Z"/>`
  ),

  // 18. Down Chevron
  ic_down: mono(
    `<path d="M5.22 8.97a1.02 1.02 0 0 1 1.44 0L12 14.31l5.34-5.34a1.02 1.02 0 1 1 1.44 1.44l-6.06 6.06a1.02 1.02 0 0 1-1.44 0L5.22 10.41a1.02 1.02 0 0 1 0-1.44Z"/>`
  ),

  // 19. Close (soft sculpted cross)
  ic_close: mono(
    `<path d="M6.22 6.22a1.02 1.02 0 0 1 1.44 0L12 10.56l4.34-4.34a1.02 1.02 0 1 1 1.44 1.44L13.44 12l4.34 4.34a1.02 1.02 0 1 1-1.44 1.44L12 13.44l-4.34 4.34a1.02 1.02 0 0 1-1.44-1.44L10.56 12 6.22 7.66a1.02 1.02 0 0 1 0-1.44Z"/>`
  ),

  // 20. More (three luminous pearls with subtle orbital ring)
  ic_more: mono(
    `<path d="M6.25 12a1.65 1.65 0 1 1-3.3 0 1.65 1.65 0 0 1 3.3 0Zm7.4 0a1.65 1.65 0 1 1-3.3 0 1.65 1.65 0 0 1 3.3 0Zm5.75 1.65a1.65 1.65 0 1 0 0-3.3 1.65 1.65 0 0 0 0 3.3Z"/>`
  ),

  // 21. Plus / Create / Add to Playlist (sculpted rounded cross)
  ic_plus: mono(
    `<path d="M12 4.25a1.05 1.05 0 0 1 1.05 1.05v5.65h5.65a1.05 1.05 0 1 1 0 2.1h-5.65v5.65a1.05 1.05 0 1 1-2.1 0v-5.65H5.3a1.05 1.05 0 1 1 0-2.1h5.65V5.3A1.05 1.05 0 0 1 12 4.25Z"/>`
  ),

  // 22. Import (rounded glass tray + smooth inward arrow)
  ic_import: mono(
    `<path d="M12 3.25a.95.95 0 0 1 .95.95v7.86l2.18-2.18a.95.95 0 1 1 1.34 1.34l-3.8 3.8a.95.95 0 0 1-1.34 0l-3.8-3.8a.95.95 0 1 1 1.34-1.34l2.18 2.18V4.2a.95.95 0 0 1 .95-.95ZM6.5 9.25a.9.9 0 0 1 0 1.8h-.75c-.75 0-1.35.6-1.35 1.35v5.1c0 .75.6 1.35 1.35 1.35h12.5c.75 0 1.35-.6 1.35-1.35v-5.1c0-.75-.6-1.35-1.35-1.35h-.75a.9.9 0 1 1 0-1.8h.75A3.15 3.15 0 0 1 21.4 12.4v5.1a3.15 3.15 0 0 1-3.15 3.15H5.75A3.15 3.15 0 0 1 2.6 17.5v-5.1a3.15 3.15 0 0 1 3.15-3.15h.75Z"/>`
  ),

  // 23. Refresh / Reshuffle (twin smooth orbital arcs with arrowheads)
  refresh: mono(
    `<path d="M12 3.6a8.4 8.4 0 0 1 6.72 3.36V5.35a.9.9 0 1 1 1.8 0v3.95a.9.9 0 0 1-.9.9h-3.95a.9.9 0 1 1 0-1.8h1.85A6.6 6.6 0 0 0 5.46 11.1a.9.9 0 1 1-1.78-.24A8.4 8.4 0 0 1 12 3.6Zm8.1 9.3a.9.9 0 0 1 .78 1.02A8.4 8.4 0 0 1 5.28 17.04v1.61a.9.9 0 1 1-1.8 0V14.7a.9.9 0 0 1 .9-.9h3.95a.9.9 0 1 1 0 1.8H6.48a6.6 6.6 0 0 0 12.06-2.7.9.9 0 0 1 1.56 0Z"/>`
  ),

  // 24. Trash / Remove (sculpted minimalist capsule bin)
  ic_trash: mono(
    `<path d="M9.5 3.25A1.75 1.75 0 0 1 11.25 1.5h1.5A1.75 1.75 0 0 1 14.5 3.25v.75h4.25a.9.9 0 1 1 0 1.8h-.92l-.68 11.63A2.75 2.75 0 0 1 14.4 20h-4.8a2.75 2.75 0 0 1-2.75-2.57L6.17 5.8h-.92a.9.9 0 1 1 0-1.8H9.5v-.75Zm1.8.25v.5h1.4v-.5a.25.25 0 0 0-.25-.25h-.9a.25.25 0 0 0-.25.25ZM7.98 5.8l.66 11.52c.03.49.44.88.96.88h4.8c.52 0 .93-.39.96-.88L16.02 5.8H7.98Zm2.27 2.95a.8.8 0 0 1 .8.8v5.2a.8.8 0 1 1-1.6 0v-5.2a.8.8 0 0 1 .8-.8Zm3.5 0a.8.8 0 0 1 .8.8v5.2a.8.8 0 1 1-1.6 0v-5.2a.8.8 0 0 1 .8-.8Z" transform="translate(0 1)"/>`
  ),

  // 25. Edit / Rename (sculpted stylus pen + baseline stroke)
  ic_edit: mono(
    `<path d="M15.58 3.58a2.45 2.45 0 0 1 3.46 3.46l-8.95 8.95a2.2 2.2 0 0 1-1.02.58l-3.32.83a.9.9 0 0 1-1.09-1.09l.83-3.32c.1-.4.3-.75.58-1.02l8.95-8.95.56-.44Zm2.18 1.28a.65.65 0 0 0-.92 0l-.98.98.92.92.98-.98a.65.65 0 0 0 0-.92Zm-2.26 2.26-6.95 6.95a.5.5 0 0 0-.13.23l-.47 1.88 1.88-.47a.5.5 0 0 0 .23-.13l6.95-6.95-.92-.92-.59-.59ZM13.5 18.7a.9.9 0 0 1 .9-.9h5.35a.9.9 0 1 1 0 1.8H14.4a.9.9 0 0 1-.9-.9Z"/>`
  ),

  // 26. Switch Platform / 切换平台 (opposing orbital exchange arcs with twin platform nodes)
  ic_switch_platform: mono(
    `<path d="M7.25 4.5a2.75 2.75 0 1 0 0 5.5 2.75 2.75 0 0 0 0-5.5Zm-1.15 2.75a1.15 1.15 0 1 1 2.3 0 1.15 1.15 0 0 1-2.3 0Zm10.65 6.75a2.75 2.75 0 1 0 0 5.5 2.75 2.75 0 0 0 0-5.5Zm-1.15 2.75a1.15 1.15 0 1 1 2.3 0 1.15 1.15 0 0 1-2.3 0ZM15.72 3.72a.88.88 0 0 1 1.24 0l2.32 2.32a.88.88 0 0 1 0 1.24l-2.32 2.32a.88.88 0 1 1-1.24-1.24l.82-.82h-4.29a.88.88 0 1 1 0-1.76h4.29l-.82-.82a.88.88 0 0 1 0-1.24ZM8.28 14.4a.88.88 0 0 1 0 1.24l-.82.82h4.29a.88.88 0 1 1 0 1.76H7.46l.82.82a.88.88 0 1 1-1.24 1.24l-2.32-2.32a.88.88 0 0 1 0-1.24l2.32-2.32a.88.88 0 0 1 1.24 0Z"/>`
  ),

  // 27. Music Note (sculpted twin-beamed eighth notes)
  ic_music: mono(
    `<path d="M18.88 3.28a1.1 1.1 0 0 1 1.37 1.07v10.9a3.5 3.5 0 1 1-1.9-3.11V7.02l-7.6 1.9v8.08a3.5 3.5 0 1 1-1.9-3.11V6.35a1.1 1.1 0 0 1 .83-1.07l9.2-2Z"/>`
  ),

  // 28. Comment (minimal airy rounded chat capsule with 3 subtle dots)
  ic_comment_official: mono(
    `<path d="M5.5 4.25h13A2.75 2.75 0 0 1 21.25 7v8.25A2.75 2.75 0 0 1 18.5 18h-7.1l-3.95 2.63A.9.9 0 0 1 6.05 19.9V18H5.5a2.75 2.75 0 0 1-2.75-2.75V7A2.75 2.75 0 0 1 5.5 4.25Zm0 1.7A1.05 1.05 0 0 0 4.45 7v8.25c0 .58.47 1.05 1.05 1.05h1.4a.85.85 0 0 1 .85.85v1.18l2.8-1.86a.85.85 0 0 1 .47-.17h7.48c.58 0 1.05-.47 1.05-1.05V7c0-.58-.47-1.05-1.05-1.05h-13ZM8.5 11.1a1.15 1.15 0 1 1-2.3 0 1.15 1.15 0 0 1 2.3 0Zm4.65 0a1.15 1.15 0 1 1-2.3 0 1.15 1.15 0 0 1 2.3 0Zm3.5 1.15a1.15 1.15 0 1 0 0-2.3 1.15 1.15 0 0 0 0 2.3Z"/>`
  ),

  // 29. Share (clean minimalist 3-node network share — Android/Desktop; HarmonyOS uses official sys.symbol.share)
  ic_share_official: mono(
    `<path d="M17.5 3.5a2.75 2.75 0 1 0 0 5.5 2.75 2.75 0 0 0 0-5.5Zm-11 5.75a2.75 2.75 0 1 0 0 5.5 2.75 2.75 0 0 0 0-5.5Zm11 5.75a2.75 2.75 0 1 0 0 5.5 2.75 2.75 0 0 0 0-5.5Zm-8.28-4.76 5.9-3.16a.85.85 0 1 1 .8 1.5l-5.9 3.16a.85.85 0 1 1-.8-1.5Zm0 3.52a.85.85 0 0 1 1.15-.35l5.9 3.16a.85.85 0 1 1-.8 1.5l-5.9-3.16a.85.85 0 0 1-.35-1.15Z"/>`
  ),

  // 30. Cast / AirPlay (minimal rounded display frame + 2 clean arcs)
  ic_cast: mono(
    `<path d="M5.75 4.25h12.5A2.75 2.75 0 0 1 21 7v8.5a2.75 2.75 0 0 1-2.75 2.75h-2.1a.9.9 0 1 1 0-1.8h2.1c.52 0 .95-.43.95-.95V7c0-.52-.43-.95-.95-.95H5.75c-.52 0-.95.43-.95.95v1.6a.9.9 0 1 1-1.8 0V7a2.75 2.75 0 0 1 2.75-2.75ZM3.9 11.9a.9.9 0 0 1 .9-.9A8.2 8.2 0 0 1 13 19.2a.9.9 0 1 1-1.8 0 6.4 6.4 0 0 0-6.4-6.4.9.9 0 0 1-.9-.9Zm0 3.6a.9.9 0 0 1 .9-.9 4.6 4.6 0 0 1 4.6 4.6.9.9 0 1 1-1.8 0 2.8 2.8 0 0 0-2.8-2.8.9.9 0 0 1-.9-.9Zm2.35 3.7a1.45 1.45 0 1 1-2.9 0 1.45 1.45 0 0 1 2.9 0Z"/>`
  ),

  // 31. Style / Visual FX (ultra-clean minimal twin aurora diamond stars)
  ic_style_wand: colored(
    `<path d="M9.6 3.4c.28-.65 1.18-.65 1.46 0l1.46 3.45 3.45 1.46c.65.28.65 1.18 0 1.46l-3.45 1.46-1.46 3.45c-.28.65-1.18.65-1.46 0l-1.46-3.45-3.45-1.46c-.65-.28-.65-1.18 0-1.46l3.45-1.46L9.6 3.4Z" fill="#FFFFFF"/><path d="M16.95 13.1c.2-.46.86-.46 1.06 0l.82 1.94 1.94.82c.46.2.46.86 0 1.06l-1.94.82-.82 1.94c-.2.46-.86.46-1.06 0l-.82-1.94-1.94-.82c-.46-.2-.46-.86 0-1.06l1.94-.82.82-1.94Z" fill="#64D2FF"/>`
  ),

  // 32. Sparkle (Smart scan audio)
  ic_sparkle: colored(
    `<path d="M11.35 2.95c.26-.6 1.04-.6 1.3 0l1.42 3.28 3.28 1.42c.6.26.6 1.04 0 1.3l-3.28 1.42-1.42 3.28c-.26.6-1.04.6-1.3 0L9.93 10.37 6.65 8.95c-.6-.26-.6-1.04 0-1.3l3.28-1.42 1.42-3.28Z" fill="#64D2FF"/><path d="M17.55 13.75c.19-.43.81-.43 1 0l.68 1.52 1.52.68c.43.19.43.81 0 1l-1.52.68-.68 1.52c-.19.43-.81.43-1 0l-.68-1.52-1.52-.68c-.43-.19-.43-.81 0-1l1.52-.68.68-1.52Z" fill="#A5B4FC"/><path d="M6.05 14.35c.16-.36.64-.36.8 0l.5 1.15 1.15.5c.36.16.36.64 0 .8l-1.15.5-.5 1.15c-.16.36-.64.36-.8 0l-.5-1.15-1.15-.5c-.36-.16-.36-.64 0-.8l1.15-.5.5-1.15Z" fill="#FFFFFF"/>`
  ),

  // 33. Fullscreen / Immersive (clean minimalist diagonal expand arrows)
  fullscreen: mono(
    `<path d="M14.2 4.1a.85.85 0 0 1 .85-.85h4.85a.85.85 0 0 1 .85.85v4.85a.85.85 0 1 1-1.7 0V6.15l-4.25 4.25a.85.85 0 1 1-1.2-1.2l4.25-4.25h-2.8a.85.85 0 0 1-.85-.85ZM9.8 19.9a.85.85 0 0 1-.85.85H4.1a.85.85 0 0 1-.85-.85v-4.85a.85.85 0 1 1 1.7 0v2.8l4.25-4.25a.85.85 0 1 1 1.2 1.2l-4.25 4.25h2.8a.85.85 0 0 1 .85.85Z"/>`
  ),

  // 34. Shrink / Exit Fullscreen
  shrink: mono(
    `<path d="M7.8 3.6a.9.9 0 0 1 .9.9v2.1a2.1 2.1 0 0 1-2.1 2.1H4.5a.9.9 0 1 1 0-1.8h2.1a.3.3 0 0 0 .3-.3V4.5a.9.9 0 0 1 .9-.9Zm8.4 0a.9.9 0 0 1 .9.9v2.1c0 .17.13.3.3.3h2.1a.9.9 0 1 1 0 1.8h-2.1a2.1 2.1 0 0 1-2.1-2.1V4.5a.9.9 0 0 1 .9-.9ZM4.5 15.3h2.1a2.1 2.1 0 0 1 2.1 2.1v2.1a.9.9 0 1 1-1.8 0v-2.1a.3.3 0 0 0-.3-.3H4.5a.9.9 0 1 1 0-1.8Zm10.8 2.1a2.1 2.1 0 0 1 2.1-2.1h2.1a.9.9 0 1 1 0 1.8h-2.1a.3.3 0 0 0-.3.3v2.1a.9.9 0 1 1-1.8 0v-2.1Z"/>`
  ),

  // 35. Volume & Mute (Desktop)
  ic_volume: mono(
    `<path d="M11.35 4.52a1.1 1.1 0 0 1 1.9.76v13.44a1.1 1.1 0 0 1-1.9.76L7.38 15.6H4.75A1.75 1.75 0 0 1 3 13.85v-3.7A1.75 1.75 0 0 1 4.75 8.4h2.63l3.97-3.88Zm4.58 3.92a.9.9 0 0 1 1.27-.04 5.25 5.25 0 0 1 0 7.2.9.9 0 1 1-1.31-1.23 3.45 3.45 0 0 0 0-4.74.9.9 0 0 1 .04-1.19Zm2.58-2.46a.9.9 0 0 1 1.27-.03 8.65 8.65 0 0 1 0 12.1.9.9 0 1 1-1.3-1.24 6.85 6.85 0 0 0 0-9.62.9.9 0 0 1 .03-1.21Z"/>`
  ),
  ic_mute: mono(
    `<path d="M11.35 4.52a1.1 1.1 0 0 1 1.9.76v13.44a1.1 1.1 0 0 1-1.9.76L7.38 15.6H4.75A1.75 1.75 0 0 1 3 13.85v-3.7A1.75 1.75 0 0 1 4.75 8.4h2.63l3.97-3.88Zm4.37 4.7a.9.9 0 0 1 1.27 0L18.5 10.73l1.51-1.51a.9.9 0 1 1 1.27 1.27L19.77 12l1.51 1.51a.9.9 0 1 1-1.27 1.27L18.5 13.27l-1.51 1.51a.9.9 0 1 1-1.27-1.27L17.23 12l-1.51-1.51a.9.9 0 0 1 0-1.27Z"/>`
  ),

  // 36. Clock / Recent
  symbol_clock: mono(
    `<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM4.8 12a7.2 7.2 0 1 1 14.4 0 7.2 7.2 0 0 1-14.4 0Zm7.2-4.35a.9.9 0 0 1 .9.9v3.1l2.22 1.33a.9.9 0 1 1-.92 1.54l-2.65-1.59a.9.9 0 0 1-.45-.78V8.55a.9.9 0 0 1 .9-.9Z"/>`
  ),
};

// Home Quick-Action Chips (light/dark neutral + Glacial Prism #64D2FF active variants)
const chipSvg = (innerMonoSvg, fillHex) =>
  innerMonoSvg.replace(/#FFFFFF/g, fillHex);

const CHIP_SOURCES = {
  chip_music: ICONS.ic_music,
  chip_library: ICONS.ic_library,
  chip_queue: ICONS.ic_queue,
  chip_play: ICONS.ic_play,
  chip_more: ICONS.ic_more,
};

for (const [chipName, baseSvg] of Object.entries(CHIP_SOURCES)) {
  ICONS[chipName] = chipSvg(baseSvg, '#FFFFFF');
  ICONS[`${chipName}_on`] = chipSvg(baseSvg, '#64D2FF');
}

// Aliases so every existing asset filename across HarmonyOS & Android gets upgraded cleanly:
const ALIASES = {
  back: 'ic_back',
  close: 'ic_close',
  ic_share: 'ic_share_official',
  ic_share_arrow: 'ic_share_official',
  symbol_settings: 'ic_settings',
  symbol_import: 'ic_import',
  symbol_shuffle: 'ic_shuffle',
  symbol_repeat: 'ic_repeat',
  symbol_download: 'ic_download',
  symbol_queue: 'ic_queue',
  symbol_more: 'ic_more',
  symbol_cast: 'ic_cast',
};

fs.mkdirSync(harmonyDir, { recursive: true });
fs.mkdirSync(androidDir, { recursive: true });

for (const [name, svg] of Object.entries(ICONS)) {
  fs.writeFileSync(path.join(harmonyDir, `${name}.svg`), svg, 'utf8');
  fs.writeFileSync(path.join(androidDir, `${name}.svg`), svg, 'utf8');
}
for (const [alias, target] of Object.entries(ALIASES)) {
  const svg = ICONS[target];
  fs.writeFileSync(path.join(harmonyDir, `${alias}.svg`), svg, 'utf8');
  fs.writeFileSync(path.join(androidDir, `${alias}.svg`), svg, 'utf8');
}

// Export clean inline-SVG map (currentColor for monochrome, colored for multi-tone) for Desktop!
const desktopMap = {};
for (const [name, svg] of Object.entries(ICONS)) {
  if (name === 'ic_heart_fill' || name === 'ic_style_wand' || name === 'ic_sparkle' || name.endsWith('_on')) {
    desktopMap[name] = svg.replace(' width="24" height="24"', '');
  } else {
    desktopMap[name] = svg.replace(' width="24" height="24"', '').replace(/#FFFFFF/g, 'currentColor');
  }
}
fs.writeFileSync(desktopManifest, JSON.stringify(desktopMap, null, 2), 'utf8');
console.log(`Generated ${Object.keys(ICONS).length} bespoke icons + ${Object.keys(ALIASES).length} aliases across HarmonyOS, Android, and Desktop.`);
