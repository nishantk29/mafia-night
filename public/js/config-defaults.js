// Every default the redesign chose without asking Nishant lives here, so a change is one edit.
export const DEFAULT_PRESET_ID = 'speakeasy'; // preselected on the Presets page
export const ROOM_CODE_STEP = 1; // the room code chip + QR sit on carousel step 1 (Players)
export const SETUP_STEPS = ['Players', 'Preset', 'Seating', 'Deal'];
export const ADVANCED_DEFAULTS = { dayTimer: false, cardOnDeath: true, hiddenSetup: false }; // cardOnDeath true = current live behaviour
export const HIDDEN_SETUP_SHOWS_BALANCE = true; // hidden setups still show "At least 1 Mafia, Mafia fewer than Town"
export const SETUP_STORE_KEY = 'mafia.setup.v1';
export const SAVED_PRESETS_KEY = 'mafia.presets.saved.v1';
