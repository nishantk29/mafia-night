// The ways to deal a game. One list: the room accepts exactly these (room.js), and the FAQ is generated from it.
export const ROOM_MODES = ['app', 'cards'];
export const CARD_FLOWS = ['blind', 'claim'];

export const PLAY_MODES = [
  { id: 'phones', mode: 'app', name: 'Phones',
    how: 'Tap Host a game. Players join with the room code and each phone shows one secret role.',
    pick: 'Everyone has a phone and a connection. Nobody can peek at another role and the app deals for you.' },
  { id: 'cards-claim', mode: 'cards', cardFlow: 'claim', name: 'Card key: players look up their card',
    how: 'The app matches each role to a card code. Each player taps their code on their own phone and sees only their role.',
    pick: 'You want each role kept secret by the app. The key stays hidden.' },
  { id: 'cards-blind', mode: 'cards', cardFlow: 'blind', name: 'Card key: the Host learns who is who',
    how: 'The key (which code is which role) is shown to the whole table. On night 1, as you call each role, the players with that code raise a hand and you tap them. The app builds the cast as you go.',
    pick: 'Players have no phones. Nobody looks at who holds what.' },
  { id: 'local', name: 'Run on this device',
    how: 'No phones at all: the Host’s one screen. Choose “No phones? Run the game on this device” on the home page.',
    pick: 'No internet and no phones. It also works offline once the app is installed.' },
];
