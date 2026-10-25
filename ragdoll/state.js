// Shared game state that several files both read and change.
// Everything else lives in the file that owns it; import `state` and use `state.camX` etc.

export const state = {
  // camera: 'behind' follows the hero from over his shoulder, 'side' is the side-on street view
  camMode: localStorage.getItem('ragdollCam') === 'side' ? 'side' : 'behind',
  camYaw: 0,
  // where the view is centred along the street; chunks, litter and rats are kept around it
  camX: 0, camZ: 1,
  // rat mode: you play Pizza Rat with a rat's-eye camera while the man takes a break
  playingRat: false, ratPlayer: null,
  // the run: which block you're on, how many you've cleared, who's left to knock out
  block: 1, cleared: 0, crewLeft: 0, gateOpen: false,
  bestBlocks: +localStorage.getItem('ragdollBestBlocks') || 0,
  // score and feedback
  survived: 0, knockouts: 0, shake: 0, caughtTimer: 0,
  // the big message in the middle of the screen: { text, sub, t } with t in frames
  banner: null,
  // 0…1 black-out over the whole screen, for dropping down the manhole and climbing back out
  fade: 0,
};

export function say(text, sub = '', t = 150) { state.banner = { text, sub, t }; }

// the houses across the street only show when the camera looks down the street
export const showFrontRow = () => state.playingRat || state.camMode === 'behind';
