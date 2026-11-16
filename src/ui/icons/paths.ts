/**
 * Hand-drawn 24×24 stroke icons (stroke = currentColor). Directional icons are drawn for LTR
 * and listed in MIRRORED so they flip automatically in RTL.
 */
export const ICON_PATHS = {
  home: 'M3.5 10.5 12 4l8.5 6.5M5.5 9v10.5h4.5V14h4v5.5h4.5V9',
  users:
    'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.8c1.9.8 3.1 2.6 3.5 5.2',
  calendar: 'M4 6.5h16V20H4zM4 10.5h16M8 3.5v4M16 3.5v4',
  dumbbell: 'M3 12h18M6 8v8M3.5 9.5v5M18 8v8M20.5 9.5v5',
  more: 'M6.5 12a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM13.5 12a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM20.5 12a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z',
  plus: 'M12 5v14M5 12h14',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM15.5 15.5 20 20',
  close: 'M6 6l12 12M18 6 6 18',
  chevronForward: 'm9.5 6 6 6-6 6',
  chevronBack: 'm14.5 6-6 6 6 6',
  chevronDown: 'm6 9.5 6 6 6-6',
  trash: 'M4.5 7h15M10 4h4M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5',
  undo: 'M9 7 4.5 11.5 9 16M5 11.5h9.5a5 5 0 0 1 0 10H11',
  phone:
    'M6.5 3.5h3l1.5 4.5-2 1.5a11 11 0 0 0 5.5 5.5l1.5-2 4.5 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5.5a2 2 0 0 1 2-2Z',
  share: 'M12 3.5v11M8 7.5l4-4 4 4M7 10.5H5.5v10h13v-10H17',
  addSquare: 'M4.5 4.5h15v15h-15zM12 8.5v7M8.5 12h7',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  alert: 'M12 4 2.8 19.5h18.4zM12 10v4.5M12 17h.01',
  clock: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17ZM12 7.5V12l3 2',
  body: 'M12 6.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM5 9h14M12 9v6M9 21l3-6 3 6',
  list: 'M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01',
  utensils: 'M7 3.5v17M4.5 3.5v5a2.5 2.5 0 0 0 5 0v-5M17 20.5v-17c-2 1-3.5 3.5-3.5 7v3H17',
  pill: 'm10.5 20.5-7-7a4.9 4.9 0 0 1 7-7l7 7a4.9 4.9 0 0 1-7 7ZM7 10l7 7',
  chart: 'M4 4v16h16M8 15l3.5-4 3 2.5L20 7',
  file: 'M6 3.5h8l4 4v13H6zM14 3.5v4h4M9 12.5h6M9 16h6',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z',
  user: 'M12 11.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20.5c.8-3.8 3.7-6 7.5-6s6.7 2.2 7.5 6',
  database: 'M12 8.5c4.1 0 7.5-1.3 7.5-2.8S16.1 3 12 3 4.5 4.2 4.5 5.7 7.9 8.5 12 8.5ZM4.5 5.7v12.6C4.5 19.8 7.9 21 12 21s7.5-1.2 7.5-2.7V5.7M4.5 12c0 1.5 3.4 2.7 7.5 2.7s7.5-1.2 7.5-2.7',
  key: 'M8 15.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM11.5 11.5h9M17.5 11.5v3M20.5 11.5v2.5',
} as const;

export type IconName = keyof typeof ICON_PATHS;

export const MIRRORED: ReadonlySet<IconName> = new Set<IconName>(['chevronForward', 'chevronBack', 'undo']);
