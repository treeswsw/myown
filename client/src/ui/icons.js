// Static SVG markup only. Coloured pin icons, white line icons for the wheel, and the top-left row.
const LS = 'fill="none" stroke="#fff" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"';

export const PIN = {
  call: '<path d="M12 3l8 9h-5v9H9v-9H4z" fill="#4f8fe8" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>',
  raise: '<path d="M12 1.5l8 8h-4.6v4L12 10l-3.4 3.5v-4H4z M12 11l8 8h-4.6v3.5H8.6V19H4z" fill="#3ecf5a" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>',
  fold: '<path d="M5 5l14 14M19 5L5 19" stroke="#e8483a" stroke-width="5" stroke-linecap="round"/>',
  turn: '<circle cx="12" cy="12" r="10" fill="#2a1a06" stroke="#e9a53a" stroke-width="1.6"/><path d="M12 12L12 2A10 10 0 0 1 21.5 15z" fill="#e9a53a"/><circle cx="12" cy="12" r="1.8" fill="#fff"/>',
  play: '<rect x="4" y="5" width="10" height="14" rx="2" fill="#4f8fe8" stroke="#fff" stroke-width="1.5" transform="rotate(-12 9 12)"/><rect x="10" y="5" width="10" height="14" rx="2" fill="#3ecf5a" stroke="#fff" stroke-width="1.5" transform="rotate(10 15 12)"/>',
  lie: '<path d="M12 2l10 18H2z" fill="#e8483a" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 9v5" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="17" r="1.3" fill="#fff"/>',
};

export const LINE = {
  call: `<path d="M12 3.5l7.5 8.5h-4.5v8.5h-6V12H4.5z" ${LS}/>`,
  raise: `<path d="M12 2l7.5 7.5h-4.2v3.3L12 9.5l-3.3 3.3V9.5H4.5z M12 11.5l7.5 7.5h-4.2v3h-6.6v-3H4.5z" ${LS}/>`,
  fold: `<path d="M5.5 5.5l13 13M18.5 5.5l-13 13" ${LS}/>`,
};

const CIRCLE = 'fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
export const TOP = {
  logo: '<path fill="#fff" stroke="none" transform="translate(2.4 3.4) scale(.8)" d="M12 2C8 7 3 9.5 3 14a4.5 4.5 0 0 0 7.6 3.2L9.5 22h5l-1.1-4.8A4.5 4.5 0 0 0 21 14c0-4.5-5-7-9-12z"/>',
  emote: `<g ${CIRCLE}><circle cx="12" cy="12" r="9" fill="#fff" stroke="none"/><path d="M8 15h8M8.5 10h.01M15.5 10h.01" stroke="#111" stroke-width="2.4"/></g>`,
  ranks: '<rect x="3.5" y="5" width="9" height="13" rx="1.5" fill="#fff" stroke="#111" stroke-width="1.2" transform="rotate(-12 8 12)"/><rect x="11" y="5" width="9" height="13" rx="1.5" fill="#fff" stroke="#111" stroke-width="1.2" transform="rotate(10 16 12)"/>',
  stats: '<path d="M4 20h16v-6h-4V8h-4V4H8v6H4z" fill="#fff"/>',
  sound: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="#fff"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>',
  muted: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="#fff"/><path d="M16 9.5l5 5M21 9.5l-5 5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>',
  arrowL: `<path d="M9 2L4 7l5 5" ${LS}/>`,
  arrowR: `<path d="M5 2l5 5-5 5" ${LS}/>`,
};
