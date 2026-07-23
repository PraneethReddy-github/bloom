// Bloom icon set: 24×24 stroke icons on window.BloomIcons.
// A node icon may also be "emoji:🔥", "url:https://…/favicon.ico", or "letter:A";
// unknown names fall back to a letter monogram.
(function () {
  'use strict';
  const I = {
    // Bloom mark: five circles in a pentagon venn.
    'bloom': '<circle cx="12" cy="7.8" r="4.6"/><circle cx="15.99" cy="10.7" r="4.6"/><circle cx="14.47" cy="15.4" r="4.6"/><circle cx="9.53" cy="15.4" r="4.6"/><circle cx="8.01" cy="10.7" r="4.6"/>',
    'grid': '<rect x="3" y="3" width="7.4" height="7.4" rx="1.8"/><rect x="13.6" y="3" width="7.4" height="7.4" rx="1.8"/><rect x="3" y="13.6" width="7.4" height="7.4" rx="1.8"/><rect x="13.6" y="13.6" width="7.4" height="7.4" rx="1.8"/>',
    'globe': '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c-3 3.6-3 14.4 0 18c3-3.6 3-14.4 0-18z"/>',
    'terminal': '<rect x="3" y="4" width="18" height="16" rx="2.2"/><polyline points="7 9 10.5 12 7 15"/><path d="M12.5 15.5H17"/>',
    'gear': '<path d="M4 6.5h16"/><circle cx="14.5" cy="6.5" r="2.1"/><path d="M4 12h16"/><circle cx="8.5" cy="12" r="2.1"/><path d="M4 17.5h16"/><circle cx="15.5" cy="17.5" r="2.1"/>',
    'star': '<polygon points="12 2.8 14.35 8.76 21.03 9.06 15.8 13.24 17.58 19.69 12 16.1 6.42 19.69 8.2 13.24 2.97 9.06 9.65 8.76"/>',
    'zap': '<polygon points="13 2.5 5 13.5 11 13.5 10.2 21.5 19 10.5 13 10.5"/>',
    'folder': '<path d="M3.5 7a2 2 0 0 1 2-2h4l2.2 2.5h6.8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
    'folder-open': '<path d="M3.8 9V7a2 2 0 0 1 2-2h3.7l2.2 2.5h6.8a2 2 0 0 1 2 2V11"/><path d="M2.8 11.5h18.4l-1.9 6.6a2 2 0 0 1-1.9 1.4H6.6a2 2 0 0 1-1.9-1.4z"/>',
    'monitor': '<rect x="3" y="4.5" width="18" height="12.5" rx="2"/><path d="M8.5 20.5h7"/><path d="M12 17v3.5"/>',
    'moon': '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
    'sun': '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>',
    'lock': '<rect x="5" y="11" width="14" height="9.5" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>',
    'camera': '<path d="M2.5 9.5A2 2 0 0 1 4.5 7.5h3L9.5 5h5L16.5 7.5h3a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2z"/><circle cx="12" cy="13.4" r="3.4"/>',
    'volume': '<path d="M4 9.5v5h3.5L12 18.5V5.5L7.5 9.5z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6"/><path d="M18 6.6a8 8 0 0 1 0 10.8"/>',
    'volume-low': '<path d="M4 9.5v5h3.5L12 18.5V5.5L7.5 9.5z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6"/>',
    'volume-x': '<path d="M4 9.5v5h3.5L12 18.5V5.5L7.5 9.5z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
    'play': '<polygon points="8 5.5 19 12 8 18.5"/>',
    'skip-fwd': '<polygon points="5 5.5 14 12 5 18.5"/><path d="M18.5 5.5v13"/>',
    'skip-back': '<polygon points="19 5.5 10 12 19 18.5"/><path d="M5.5 5.5v13"/>',
    'music': '<path d="M9 18.5V6l11-2.2v12.7"/><circle cx="6.5" cy="18.5" r="2.6"/><circle cx="17.5" cy="16.5" r="2.6"/>',
    'wifi': '<path d="M2.5 9.3a14 14 0 0 1 19 0"/><path d="M5.8 12.8a9.5 9.5 0 0 1 12.4 0"/><path d="M9.2 16.2a5 5 0 0 1 5.6 0"/><path d="M12 19.4h.01"/>',
    'bluetooth': '<path d="M7 7.5l10 9L12 21V3l5 4.5-10 9"/>',
    'clipboard': '<rect x="5" y="4.5" width="14" height="17" rx="2"/><rect x="9" y="2.5" width="6" height="4" rx="1.2"/><path d="M9 11.5h6M9 15.5h4"/>',
    'file': '<path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z"/><path d="M14 2.5V8h5.5"/>',
    'mail': '<rect x="2.5" y="5" width="19" height="14" rx="2"/><polyline points="3.5 7.5 12 13.5 20.5 7.5"/>',
    'calendar': '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.8h17M8 3v4M16 3v4"/>',
    'clock': '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12.5 15.5 14.5"/>',
    'search': '<circle cx="11" cy="11" r="6.5"/><path d="M15.8 15.8l4.7 4.7"/>',
    'plus': '<path d="M12 5v14M5 12h14"/>',
    'pencil': '<path d="M4 20l1-4L16.5 4.5a2.12 2.12 0 0 1 3 3L8 19z"/><path d="M13.5 7.5l3 3"/>',
    'trash': '<path d="M4 7h16"/><path d="M6.5 7l1 12.5a1.9 1.9 0 0 0 1.9 1.5h5.2a1.9 1.9 0 0 0 1.9-1.5l1-12.5"/><path d="M9.5 7V4.8a1.3 1.3 0 0 1 1.3-1.3h2.4a1.3 1.3 0 0 1 1.3 1.3V7"/><path d="M10 11v6M14 11v6"/>',
    'check': '<polyline points="5 12.5 10 17.5 19 7"/>',
    'x': '<path d="M6 6l12 12M18 6L6 18"/>',
    'chevron-left': '<polyline points="14.5 6 8.5 12 14.5 18"/>',
    'chevron-right': '<polyline points="9.5 6 15.5 12 9.5 18"/>',
    'chevron-down': '<polyline points="6 9.5 12 15.5 18 9.5"/>',
    'chevron-up': '<polyline points="6 14.5 12 8.5 18 14.5"/>',
    'back': '<path d="M19 12H5"/><polyline points="11 6 5 12 11 18"/>',
    'home': '<path d="M4 11.5L12 4.5l8 7"/><path d="M6.5 10.2V19.5h11v-9.3"/><path d="M10 19.5v-5h4v5"/>',
    'sparkle': '<path d="M12 3.5c.6 3.8 2.2 5.4 6 6-3.8.6-5.4 2.2-6 6-.6-3.8-2.2-5.4-6-6 3.8-.6 5.4-2.2 6-6z"/><path d="M18.8 16.2c.3 1.9 1.1 2.7 3 3-1.9.3-2.7 1.1-3 3-.3-1.9-1.1-2.7-3-3 1.9-.3 2.7-1.1 3-3z"/>',
    'command': '<path d="M9 9V6.5A2.5 2.5 0 1 0 6.5 9H9zm0 0h6m-6 0v6m6-6V6.5A2.5 2.5 0 1 1 17.5 9H15zm0 6h2.5a2.5 2.5 0 1 1-2.5 2.5V15zm0 0H9m0 0H6.5A2.5 2.5 0 1 0 9 17.5V15z"/>',
    'cpu': '<rect x="6" y="6" width="12" height="12" rx="1.6"/><rect x="9.6" y="9.6" width="4.8" height="4.8" rx="0.8"/><path d="M8.5 2.5V6M15.5 2.5V6M8.5 18v3.5M15.5 18v3.5M2.5 8.5H6M2.5 15.5H6M18 8.5h3.5M18 15.5h3.5"/>',
    'keyboard': '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M6 13.5h.01M9.5 13.5h.01M13 13.5h.01M16.5 13.5h.01M8 15.8h8"/>',
    'image': '<rect x="3" y="4.5" width="18" height="15" rx="2"/><circle cx="8.5" cy="9.5" r="1.7"/><polyline points="3.5 17 9.5 11.5 13.5 15 16.5 12.5 20.5 16"/>',
    'link': '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.5 1.5"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.5-1.5"/>',
    'code': '<polyline points="8.5 7 3.5 12 8.5 17"/><polyline points="15.5 7 20.5 12 15.5 17"/>',
    'briefcase': '<rect x="3" y="7.5" width="18" height="12.5" rx="2"/><path d="M8.5 7.5V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.5"/><path d="M3 12.5h18"/>',
    'activity': '<polyline points="3 12.5 7 12.5 10 5.5 14 19 17 12.5 21 12.5"/>',
    'zzz': '<polyline points="5.5 8.5 10.5 8.5 5.5 14.5 10.5 14.5"/><polyline points="14 5.5 18 5.5 14 10 18 10"/>',
    'eye': '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.7"/>',
    'power': '<path d="M12 3v8"/><path d="M7 6.2a8 8 0 1 0 10 0"/>',
    'refresh': '<path d="M20.5 4v4.5H16"/><path d="M20.2 8.5A8 8 0 1 0 20.9 13"/>',
    'drag': '<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"/>',
    'question': '<path d="M9 9a3 3 0 1 1 4.9 2.3c-.9.74-1.9 1.2-1.9 2.7"/><path d="M12 17.5h.01"/>',
    'download': '<path d="M12 3.5v11"/><polyline points="7 10 12 15 17 10"/><path d="M4.5 19.5h15"/>',
    'upload': '<path d="M12 14.5v-11"/><polyline points="7 8.5 12 3.5 17 8.5"/><path d="M4.5 19.5h15"/>',
    // press-and-hold marker (used for the "hold the bud" favourite)
    'hold': '<circle cx="12" cy="12" r="3.4" fill="currentColor" stroke="none"/><path d="M6.4 6.4a7.9 7.9 0 0 0 0 11.2M17.6 6.4a7.9 7.9 0 0 1 0 11.2"/>',
    'bell': '<path d="M6 9.5a6 6 0 0 1 12 0c0 4.5 2 5.5 2 5.5H4s2-1 2-5.5z"/><path d="M10.3 19a2 2 0 0 0 3.4 0"/>',
    'bookmark': '<path d="M6.5 3.5h11a1 1 0 0 1 1 1V21l-6.5-4.3L5.5 21V4.5a1 1 0 0 1 1-1z"/>',
    'heart': '<path d="M12 20.5l-7.3-7.2a4.6 4.6 0 0 1 6.5-6.5l.8.8.8-.8a4.6 4.6 0 0 1 6.5 6.5z"/>',
    'flame': '<path d="M12 2.5s5 4.2 5 9a5 5 0 0 1-10 0c0-2 1-3.6 1-3.6s.6 1.4 1.6 1.9C10.4 7.6 12 5 12 2.5z"/>',
    'rocket': '<path d="M12 2.5c3.2 2 5 5.6 5 9.3l-2.6 2.6H9.6L7 11.8c0-3.7 1.8-7.3 5-9.3z"/><circle cx="12" cy="10" r="1.7"/><path d="M9.6 14.4L7 17l1.6 1.6M14.4 14.4L17 17l-1.6 1.6M12 17.5V21.5"/>',
    'key': '<circle cx="8" cy="15" r="4.2"/><path d="M11 12L20 3l1.5 1.5-1.6 1.6 1.6 1.6-2.6 2.6-1.6-1.6-1.9 1.9"/>',
    'lightbulb': '<path d="M9.2 17.4a6 6 0 1 1 5.6 0v1.6a1.5 1.5 0 0 1-1.5 1.5h-2.6a1.5 1.5 0 0 1-1.5-1.5z"/><path d="M9.6 20.8h4.8"/>',
    'layers': '<polygon points="12 2.8 21.5 7.8 12 12.8 2.5 7.8"/><polyline points="2.5 12.2 12 17.2 21.5 12.2"/><polyline points="2.5 16.4 12 21.4 21.5 16.4"/>',
    'list': '<path d="M8.5 6.5h12M8.5 12h12M8.5 17.5h12M4 6.5h.01M4 12h.01M4 17.5h.01"/>',
    'message': '<path d="M20.5 12.4a7.5 7.5 0 0 1-10.9 6.7L4 20.5l1.4-5.4A7.5 7.5 0 1 1 20.5 12.4z"/>',
    'mic': '<rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0"/><path d="M12 18v3.5M8.5 21.5h7"/>',
    'phone': '<path d="M6.5 3.5h4l1.5 4-2 1.5a12 12 0 0 0 5 5l1.5-2 4 1.5v4a1.5 1.5 0 0 1-1.6 1.5C10.7 18.6 5.4 13.3 5 5.1a1.5 1.5 0 0 1 1.5-1.6z"/>',
    'pin': '<path d="M12 21.5s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10.2" r="2.6"/>',
    'package': '<path d="M20.5 7.8v8.4a1.5 1.5 0 0 1-.8 1.3l-7 3.8a1.5 1.5 0 0 1-1.4 0l-7-3.8a1.5 1.5 0 0 1-.8-1.3V7.8"/><polyline points="3.5 7.8 12 12.4 20.5 7.8"/><path d="M12 12.4V20.9"/><path d="M3.5 7.8L12 3.2l8.5 4.6"/>',
    'palette': '<path d="M12 3a9 9 0 0 0 0 18c1.2 0 1.9-.9 1.9-1.9 0-1.6 1.2-1.9 2.4-1.9H18a3.5 3.5 0 0 0 3.5-3.5C21.5 7.6 17.3 3 12 3z"/><circle cx="7.8" cy="11.6" r="1.1"/><circle cx="10.6" cy="7.9" r="1.1"/><circle cx="15" cy="8.4" r="1.1"/>',
    'pie-chart': '<path d="M20.9 15.6A9 9 0 1 1 8.4 3.1"/><path d="M21.3 12A9.3 9.3 0 0 0 12 2.7V12z"/>',
    'bar-chart': '<path d="M3 21h18"/><rect x="4.6" y="11" width="3.6" height="7" rx="1"/><rect x="10.2" y="5.5" width="3.6" height="12.5" rx="1"/><rect x="15.8" y="14" width="3.6" height="4" rx="1"/>',
    'shield': '<path d="M12 2.8l8 3v5.7c0 4.5-3.2 8.5-8 9.7-4.8-1.2-8-5.2-8-9.7V5.8z"/>',
    'send': '<path d="M21.5 2.5L10.6 13.4"/><polygon points="21.5 2.5 15 21.5 10.6 13.4 2.5 9 21.5 2.5"/>',
    'share': '<circle cx="18" cy="5.5" r="2.8"/><circle cx="6" cy="12" r="2.8"/><circle cx="18" cy="18.5" r="2.8"/><path d="M8.5 10.7l7-3.6M8.5 13.3l7 3.6"/>',
    'tag': '<path d="M11.6 3.5H20a.5.5 0 0 1 .5.5v8.4a1 1 0 0 1-.3.7l-7.4 7.4a1 1 0 0 1-1.4 0l-7.7-7.7a1 1 0 0 1 0-1.4l7.4-7.4a1 1 0 0 1 .5-.5z"/><circle cx="16.4" cy="7.6" r="1.4"/>',
    'target': '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/>',
    'timer': '<circle cx="12" cy="13.6" r="8"/><path d="M12 9.6v4l2.5 2M9.5 2.5h5"/>',
    'wrench': '<path d="M20.2 5.5a5.2 5.2 0 0 1-6.8 6.6L5.8 19.7a2.4 2.4 0 0 1-3.4-3.4l7.6-7.6a5.2 5.2 0 0 1 6.6-6.8l-3 3 2.6 2.6z"/>',
    'trending-up': '<polyline points="3 17 9.5 10.5 13.5 14.5 21 7"/><polyline points="15.5 7 21 7 21 12.5"/>',
    'trophy': '<path d="M8 3.5h8V9a4 4 0 0 1-8 0z"/><path d="M8 5H5.5a2.5 2.5 0 0 0 2.5 4.2"/><path d="M16 5h2.5a2.5 2.5 0 0 1-2.5 4.2"/><path d="M12 13v3.4M8.3 20.5h7.4l-1-4h-5.4z"/>',
    'user': '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
    'users': '<circle cx="9.5" cy="8" r="3.6"/><path d="M3 20.5a6.5 6.5 0 0 1 13 0"/><path d="M16 4.7a3.6 3.6 0 0 1 0 6.9M17.5 14.6a6.5 6.5 0 0 1 3.5 5.9"/>',
    'video': '<rect x="2.5" y="6" width="13" height="12" rx="2"/><polygon points="15.5 10.5 21.5 7 21.5 17 15.5 13.5"/>',
    'book': '<path d="M4 4.5A2 2 0 0 1 6 2.5h13.5v14H6a2 2 0 0 0-2 2z"/><path d="M4 18.5a2 2 0 0 1 2-2h13.5v5H6a2 2 0 0 1-2-2z"/>',
    'bug': '<rect x="8" y="7" width="8" height="12" rx="4"/><path d="M9.5 7.2a2.5 2.5 0 0 1 5 0"/><path d="M8 11H4.5M8 15H5M16 11h3.5M16 15h3M9.6 19.2L8 21.5M14.4 19.2l1.6 2.3M9.6 6.2L8.2 4M14.4 6.2L15.8 4"/>',
    'cloud': '<path d="M7 18.5a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 10.2a4.2 4.2 0 0 1-.6 8.3z"/>',
    'coffee': '<path d="M4 8.5h13v6a4.5 4.5 0 0 1-9 0z"/><path d="M17 9.6h1.8a2.6 2.6 0 0 1 0 5.2H17"/><path d="M4 20.5h13"/>',
    'database': '<ellipse cx="12" cy="6" rx="8" ry="3.2"/><path d="M4 6v6c0 1.8 3.6 3.2 8 3.2s8-1.4 8-3.2V6"/><path d="M4 12v6c0 1.8 3.6 3.2 8 3.2s8-1.4 8-3.2v-6"/>',
    'filter': '<polygon points="3.5 4.5 20.5 4.5 14 12.5 14 19.5 10 21.2 10 12.5"/>',
    'flag': '<path d="M5 21.5V3.5"/><path d="M5 4.5h11.5l-2 4 2 4H5z"/>',
    'gift': '<rect x="3" y="8.5" width="18" height="4.5" rx="1"/><path d="M4.5 13v7a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-7"/><path d="M12 8.5v13"/><path d="M12 8.5S10.5 3 8 3a2.5 2.5 0 0 0 0 5.5zM12 8.5S13.5 3 16 3a2.5 2.5 0 0 1 0 5.5z"/>',
    'git-branch': '<circle cx="6.5" cy="5.5" r="2.5"/><circle cx="6.5" cy="18.5" r="2.5"/><circle cx="17.5" cy="8.5" r="2.5"/><path d="M6.5 8v8"/><path d="M17.5 11a6 6 0 0 1-6 6H9.2"/>',
    'hash': '<path d="M4.5 9h15M4.5 15h15M10 3.5L8 20.5M16 3.5l-2 17"/>',
    'inbox': '<path d="M3 13h5l1.5 3h5l1.5-3h5"/><path d="M4.8 5.4a1.5 1.5 0 0 1 1.4-.9h11.6a1.5 1.5 0 0 1 1.4.9L21 13v4.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V13z"/>',
    'pause': '<rect x="7" y="5" width="3.5" height="14" rx="1"/><rect x="13.5" y="5" width="3.5" height="14" rx="1"/>',
    'printer': '<path d="M6.5 9.5V3.5h11v6"/><rect x="3" y="9.5" width="18" height="7.5" rx="2"/><rect x="6.5" y="14" width="11" height="6.5" rx="1"/>',
    'save': '<path d="M4.5 5.5a2 2 0 0 1 2-2h9.6L20.5 8v10.5a2 2 0 0 1-2 2h-12a2 2 0 0 1-2-2z"/><path d="M8 3.5v5h7v-5"/><rect x="8" y="13" width="8" height="7.5" rx="1"/>',
    'scissors': '<circle cx="6" cy="6" r="2.6"/><circle cx="6" cy="18" r="2.6"/><path d="M8.3 7.6L20 18M8.3 16.4L20 6"/>',
    'server': '<rect x="3" y="4" width="18" height="6.5" rx="1.8"/><rect x="3" y="13.5" width="18" height="6.5" rx="1.8"/><path d="M7 7.2h.01M7 16.8h.01"/>',
    'cart': '<circle cx="9.5" cy="20" r="1.6"/><circle cx="18" cy="20" r="1.6"/><path d="M2.5 3.5h2.8l2.4 11.2h11l2.3-8H6.4"/>',
    'sliders': '<path d="M4 8h10M18.2 8H20M4 16h4M12.2 16H20"/><circle cx="16" cy="8" r="2.2"/><circle cx="10" cy="16" r="2.2"/>',
    'smile': '<circle cx="12" cy="12" r="9"/><path d="M8.2 14a4.6 4.6 0 0 0 7.6 0"/><path d="M9.3 9.5h.01M14.7 9.5h.01"/>',
    'thumbs-up': '<path d="M7 10.6l4-7.1a2.2 2.2 0 0 1 2.2 2.2V9.6h5a2 2 0 0 1 2 2.3l-1.2 6.5a2 2 0 0 1-2 1.6H7"/><rect x="2.5" y="10.6" width="4.5" height="9.4" rx="1.2"/>',
    'ticket': '<path d="M3 8.5v-2a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2a3.5 3.5 0 0 0 0 7v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2a3.5 3.5 0 0 0 0-7z"/><path d="M14 5.5v13"/>',
    'wand': '<path d="M3.5 20.5L15 9"/><path d="M17.5 2.5v3.2M21.5 4.5l-2.2 2.2M22 9.5h-3.2"/><path d="M13 7l4 4"/>',
    'wind': '<path d="M3 8h10a3 3 0 1 0-3-3"/><path d="M3 12h14a3 3 0 1 1-3 3"/><path d="M3 16h7"/>',
    'unlock': '<rect x="5" y="11" width="14" height="9.5" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 7.6-1.7"/>',
    'repeat': '<polyline points="17 2.5 20.5 6 17 9.5"/><path d="M3.5 12.5V9a3 3 0 0 1 3-3h14"/><polyline points="7 21.5 3.5 18 7 14.5"/><path d="M20.5 11.5V15a3 3 0 0 1-3 3h-14"/>',
    'shuffle': '<polyline points="16.5 3.5 20.5 3.5 20.5 7.5"/><path d="M3.5 20.5L20.5 3.5"/><polyline points="16.5 20.5 20.5 20.5 20.5 16.5"/><path d="M3.5 3.5l5.5 5.5M15 15l5.5 5.5"/>',
    'text': '<path d="M4 7V4.5h16V7M12 4.5v15M8.5 19.5h7"/>',
    'plane': '<path d="M10.5 3.2a1.5 1.5 0 0 1 3 0V9l8 4.6v2.2l-8-2.3v4l2.6 2v1.6L12 20.2l-4.1.9v-1.6l2.6-2v-4l-8 2.3v-2.2l8-4.6z"/>',
    'circle': '<circle cx="12" cy="12" r="9"/>',
    'square': '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/>',
    'triangle': '<path d="M12 3.5L21.5 20.5H2.5z"/>',
    'minus': '<path d="M5 12h14"/>'
  };

  function markup(name, size, cls) {
    size = size || 24;
    cls = cls || 'ic';
    if (!name) name = 'sparkle';
    if (name.startsWith('emoji:')) {
      return `<span class="${cls} ic-emoji" style="font-size:${Math.round(size * 0.82)}px;line-height:1">${escapeHTML(name.slice(6))}</span>`;
    }
    if (name.startsWith('url:') || /^https?:\/\//.test(name)) {
      const src = name.startsWith('url:') ? name.slice(4) : name;
      return `<img class="${cls} ic-img" width="${size}" height="${size}" src="${escapeHTML(src)}" onerror="this.style.display='none'">`;
    }
    if (name.startsWith('letter:') || !I[name]) {
      const ch = name.startsWith('letter:') ? name.slice(7, 8) : (name[0] || '?');
      return `<span class="${cls} ic-letter" style="font-size:${Math.round(size * 0.6)}px;width:${size}px;height:${size}px">${escapeHTML(ch.toUpperCase())}</span>`;
    }
    return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[name]}</svg>`;
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Bloom logo: five overlapping circles in a pentagon. opts.disc adds a dark backing disc.
  const LOGO_CIRCLES = [
    [32, 20.8], [42.65, 28.54], [38.59, 41.06], [25.41, 41.06], [21.35, 28.54]
  ];
  function logo(size, opts) {
    opts = opts || {};
    size = size || 48;
    const stroke = opts.stroke || '#ffffff';
    const sw = opts.strokeWidth || 2.2;
    const circles = LOGO_CIRCLES.map(([cx, cy]) =>
      `<circle cx="${cx}" cy="${cy}" r="12.5"/>`).join('');
    const disc = opts.disc
      ? `<defs><radialGradient id="blg" cx="42%" cy="34%" r="72%">
           <stop offset="0%" stop-color="#2a2a2a"/><stop offset="100%" stop-color="#050505"/>
         </radialGradient></defs>
         <rect width="64" height="64" rx="${opts.radius ?? 15}" fill="url(#blg)"/>`
      : '';
    return `<svg class="${opts.cls || 'bloom-logo'}" width="${size}" height="${size}" viewBox="0 0 64 64"
      fill="none" stroke="${stroke}" stroke-width="${sw}" aria-hidden="true">${disc}<g>${circles}</g></svg>`;
  }

  window.BloomIcons = { markup, logo, names: Object.keys(I), escapeHTML };
})();
