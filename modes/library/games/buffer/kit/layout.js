// where the dock goes, from the buffer's own size: beside the board on landscape, under it on
// portrait, and over the board's foot as a sheet once the buffer is phone-narrow. the rule is the
// design's — put the dock wherever it leaves the bigger board square. Shell reads it; the suite
// pins it at the sizes a view never renders under a server.
export const NAV = 41;
export const SEATS = 68;
export const FLOOR = 240;
export const PHONE = 760;
export const BAR = 44;

export function place({ width, height, dockWidth = 300, dockHeight = 320, shown = true }) {
  // phone-narrow: the rail leaves the board's side and becomes a bar under it, because 44px of
  // side rail is 11% of a phone's width and the board is the thing worth the pixels
  const cover = width < PHONE;
  const rail = cover ? 0 : 36;
  const bar = cover ? BAR : 0;
  const freeWidth = width - rail;
  const freeHeight = height - NAV - SEATS - bar;
  const narrow = cover || Math.min(freeWidth, freeHeight - dockHeight) > Math.min(freeWidth - dockWidth, freeHeight);
  const pad = Math.round(Math.max(4, Math.min(18, Math.min(width, height) * 0.014)));
  // the sheet reserves its height under the board first; it overlaps the board only at the floor
  const lift = cover && shown ? Math.max(0, Math.min(dockHeight, freeHeight - 2 * pad - FLOOR)) : 0;
  return { cover, rail, bar, narrow, pad, lift };
}
