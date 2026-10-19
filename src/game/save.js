const KEY = 'lucky-dino-feast-v1';

const fresh = () => ({ snacks: 0, crest: 'yellow', crests: ['yellow'], stunts: ['roll', 'flip'], muted: false, eggs: [] });

/** Progress lives on the device only (no accounts). */
export function loadSave() {
  try {
    return { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return fresh();
  }
}

export function storeSave(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable (private mode etc.) */
  }
}
