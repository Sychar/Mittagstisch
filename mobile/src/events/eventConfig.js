export const eventTagOptions = [
  { key: 'sport', label: 'Sport', icon: 'football-outline' },
  { key: 'culture', label: 'Kultur', icon: 'color-palette-outline' },
  { key: 'music', label: 'Musik', icon: 'musical-notes-outline' },
  { key: 'party', label: 'Party', icon: 'sparkles-outline' },
  { key: 'trip', label: 'Ausflug', icon: 'compass-outline' },
  { key: 'family', label: 'Familie', icon: 'people-outline' },
  { key: 'market', label: 'Markt', icon: 'storefront-outline' },
  { key: 'workshop', label: 'Workshop', icon: 'construct-outline' },
  { key: 'cinema', label: 'Kino', icon: 'film-outline' },
  { key: 'other', label: 'Sonstiges', icon: 'calendar-outline' }
];

export const eventTagKeys = eventTagOptions.map((option) => option.key);

export const eventTagLabelByKey = eventTagOptions.reduce((acc, option) => {
  acc[option.key] = option.label;
  return acc;
}, {});

export const eventTagIconByKey = eventTagOptions.reduce((acc, option) => {
  acc[option.key] = option.icon;
  return acc;
}, {});

export const eventThemeByTag = {
  sport: {
    colors: ['#16A34A', '#0891B2', '#0F766E'],
    accent: '#BBF7D0',
    shape: '#22D3EE',
    icon: 'football-outline'
  },
  culture: {
    colors: ['#7C2D12', '#B45309', '#F4A261'],
    accent: '#FED7AA',
    shape: '#FFF7ED',
    icon: 'color-palette-outline'
  },
  music: {
    colors: ['#111827', '#3730A3', '#7C3AED'],
    accent: '#C4B5FD',
    shape: '#818CF8',
    icon: 'musical-notes-outline'
  },
  party: {
    colors: ['#DB2777', '#F97316', '#FACC15'],
    accent: '#FFE4E6',
    shape: '#FDE68A',
    icon: 'sparkles-outline'
  },
  trip: {
    colors: ['#15803D', '#0EA5E9', '#A7F3D0'],
    accent: '#DCFCE7',
    shape: '#BAE6FD',
    icon: 'compass-outline'
  },
  family: {
    colors: ['#F59E0B', '#34D399', '#A7F3D0'],
    accent: '#FEF3C7',
    shape: '#DCFCE7',
    icon: 'people-outline'
  },
  market: {
    colors: ['#B45309', '#EA580C', '#FBBF24'],
    accent: '#FED7AA',
    shape: '#FEF3C7',
    icon: 'storefront-outline'
  },
  workshop: {
    colors: ['#2563EB', '#7C3AED', '#60A5FA'],
    accent: '#DBEAFE',
    shape: '#C4B5FD',
    icon: 'construct-outline'
  },
  cinema: {
    colors: ['#020617', '#1E293B', '#B91C1C'],
    accent: '#FECACA',
    shape: '#64748B',
    icon: 'film-outline'
  },
  other: {
    colors: ['#00BCD4', '#22C55E', '#77ABFF'],
    accent: '#CCFBF1',
    shape: '#BAE6FD',
    icon: 'calendar-outline'
  }
};

export const normalizeEventTags = (value) => {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value
    .map((entry) => String(entry || '').trim())
    .filter((entry) => eventTagKeys.includes(entry) && !seen.has(entry) && seen.add(entry));
};

export const getPrimaryEventTag = (event) => {
  const tags = normalizeEventTags(event?.tags);
  const primary = String(event?.primaryTag || '').trim();
  return tags.includes(primary) ? primary : tags[0] || 'other';
};
