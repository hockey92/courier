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
  // score and feedback
  survived: 0, best: +localStorage.getItem('ragdollBestTime') || 0,
  knockouts: 0, farthest: 0,
  spawnTimer: 90, shake: 0, caughtTimer: 0,
  // 0…1 black-out over the whole screen, for dropping down the manhole and climbing back out
  fade: 0,
};

// the houses across the street only show when the camera looks down the street
export const showFrontRow = () => state.playingRat || state.camMode === 'behind';
