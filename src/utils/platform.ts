const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

export const modKey = isMac ? '⌘' : 'Ctrl';