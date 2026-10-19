# Lucky's Dino Feast

A cute, silly 3D game for a young dinosaur fan. Fly **Lucky the cockatoo** around a bright island world,
feed the hungry baby dinosaurs, catch glowing bugs for snacks, and do stunts. *Fastooka!*

Built with [three.js](https://threejs.org) + [Vite](https://vitejs.dev), shipped as an installable,
offline-capable PWA on GitHub Pages. No accounts, no ads, no failing.

**Play:** https://yasserbahaa98.github.io/lucky-dino-feast/

## Install on an Android tablet

1. Open the link above in Chrome or Samsung Internet.
2. Tap **Install app** on the title screen (or use the browser menu, then *Add to Home screen*).
3. Lucky's Dino Feast now opens full screen from the home screen and works without internet.

## How to play (no reading needed)

| Button | What it does |
| --- | --- |
| ◀ ▶ | Hold to turn |
| Wings | Hold to fly up, let go to glide gently down |
| Fruit | Appears near a hungry dino: tosses the fruit it wants |
| Bug | Appears near a glowing bug: gobble it as a snack |
| Swirl | Do a stunt (barrel roll, upside-down flip, and an unlockable loop) |

Fill every dinosaur's belly (the dots in the thought bubble) to finish a level. Snacks unlock a pink crest
(10), a loop-de-loop stunt (25) and a blue crest (40). Tap the crest button at the top to switch colors.

Keyboard (for testing): arrows/WASD to steer, Space/W/Up to fly, E to feed, C to catch, S to stunt.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173/lucky-dino-feast/
npm run build      # production build in dist/
npm run icons      # regenerate PNG icons from public/icon.svg
```

Every push to `main` builds and deploys to GitHub Pages via `.github/workflows/deploy.yml`.

## Custom "Fastooka!" voice

The catchphrase is synthesized by default. To use a real recording (for example, recorded from the toy),
add `public/fastooka.mp3` and push. The game picks it up automatically.

## Project layout

```
src/
  main.js            entry: fonts, styles, service worker, game
  game/              game loop, levels, flight, camera, input, save
  actors/            Lucky, dinosaurs, fruit + thought bubbles, bugs
  world/             islands, water, sky, clouds, volcano, particles
  ui/                HUD, icons, word bubbles, confetti
  audio/             WebAudio sound effects + music (no audio files)
docs/design.md       the original design spec
```
