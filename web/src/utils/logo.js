const BLUE_FAVICON_PRESETS = new Set(['sky', 'emerald', 'forest', 'graphite']);

export const BRAND_LOGO_SRC = '/logo/Radar.png';
export const RADAR_BLUE_LOGO_SRC = '/logo/RadarBlue.png';
export const RADAR_RED_LOGO_SRC = '/logo/RadarRed.png';

export function getFaviconLogoSrc(presetKey) {
  return BLUE_FAVICON_PRESETS.has(presetKey) ? RADAR_BLUE_LOGO_SRC : RADAR_RED_LOGO_SRC;
}

export function syncFaviconLogo(presetKey) {
  const href = getFaviconLogoSrc(presetKey);
  const selectors = ['icon', 'shortcut icon', 'apple-touch-icon'];

  selectors.forEach((rel) => {
    let link = document.querySelector(`link[rel="${rel}"]`);
    if (!link) {
      link = document.createElement('link');
      link.rel = rel;
      document.head.appendChild(link);
    }
    link.type = 'image/png';
    link.href = href;
  });
}
