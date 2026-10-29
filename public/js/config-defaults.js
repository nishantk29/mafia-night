// Every default the redesign chose without asking Nishant lives here, so a change is one edit.
export const DEFAULT_PRESET_ID = 'speakeasy'; // preselected on the Presets page
export const ROOM_CODE_STEP = 1; // the room code chip + QR sit on carousel step 1 (Players)
export const SETUP_STEPS = ['Players', 'Preset', 'Seating', 'Deal'];
export const ADVANCED_DEFAULTS = { dayTimer: false, cardOnDeath: true, hiddenSetup: false }; // cardOnDeath true = current live behaviour
export const HIDDEN_SETUP_SHOWS_BALANCE = true; // hidden setups still show "At least 1 Mafia, Mafia fewer than Town"
export const SETUP_STORE_KEY = 'mafia.setup.v1';
export const SAVED_PRESETS_KEY = 'mafia.presets.saved.v1';
export const ADVANCED_STORE_KEY = 'mafia.advanced.v1'; // Advanced settings, saved on the phone for next time
export const OFFLINE_STEPS = ['Players', 'Roles', 'Cards']; // Play offline: players, roles, how to deal
export const DEFAULT_OFFLINE_DEAL = 'printable'; // preselected on "How do you want to deal roles?"
export const MAX_SAVED_PRESETS = 12; // saved presets kept on this phone
export const SLIDE_MS = 240; // carousel slide (transform only); reduced motion uses FADE_MS
export const FADE_MS = 120;
export const SWIPE_PX = 60; // horizontal travel that counts as a swipe
