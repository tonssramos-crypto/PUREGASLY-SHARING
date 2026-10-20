// Keep in sync with ACCENT_COLORS in server/controllers/storeController.js.
// '' means "default PureGasly blue/purple".
export const ACCENT_COLORS = ['', '#3457c9', '#0e8f6e', '#d9480f', '#c2255c', '#7a2ea0', '#0b7285', '#e8590c', '#364fc7'];

export function accentBackground(accent) {
  return accent ? { background: `linear-gradient(135deg, ${accent}, ${accent}b3)` } : undefined;
}
