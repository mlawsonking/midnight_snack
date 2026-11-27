// Household and table settings. All names live here; generic storybook names only.
export const CONFIG = {
  title: 'Midnight Snack',
  names: { cat: 'Mittens', dog: 'Biscuit', baby: 'Little Bean', parent: 'Grown-up' },
  houses: { littlehouse: 'The Little House', cottage: 'The Cottage', tallhouse: 'The Tall House', bighouse: 'The Big House' },
  parts: { rampR: 'ramp', rampL: 'ramp', string: 'string', ball: 'ball', dot: 'red-dot lamp', mouse: 'toy mouse' },
  players: 2, // default count shown on the players screen (1 to 4)
  // one colour + token shape per player (no reading needed to see whose turn it is)
  playerColors: ['#ff9f43', '#6ad0ff', '#b98cff', '#7be38a'],
  playerShapes: ['star', 'moon', 'heart', 'sun'],
  tickMs: 420, // run animation speed (rules are per tick; this is presentation only)
  holdMs: 1000, // hold-to-confirm time for go (and for going back to the house picker)
  rewindMs: 1500,
  hintAfterFails: 1, // show the hint glow after this many failed runs in a house
  introMs: 5600, // the wordless goal intro on first entering a house
  tourStopMs: 2600, // each stop of the "meet the house" tour (one bubble cycle)
  explainMs: 3600, // how long a failed run's explanation holds before the rewind
  storageKey: 'midnight-snack-solved', // {v: 2, solved: {houseId: true}}; old 3-entry arrays are migrated
  seenKey: 'midnight-snack-seen', // house ids whose intro was seen, and habits already toured
};
