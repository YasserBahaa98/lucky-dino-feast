# Lucky's Dino Feast: Design

**Status:** Draft approved in conversation. Open items are listed at the end.
**Working title:** Lucky's Dino Feast (rename freely)
**Character name:** Lucky (the cockatoo toy's name)

## Intent and why

A surprise game for a young kid (a child, a cousin of the person asking). He loves dinosaurs, and his favorite toy is a white cockatoo plush with a yellow crest, grey beak, and grey feet. He loves watching animations and silly moments, and he's happy to see the toy look funny.

The game should feel like a cute, silly toy come to life: Lucky, a bird friend who flies around feeding hungry dinosaurs and keeps doing funny stunts.

The toy has a catchphrase, **"Fastooka!"**, that he says when something silly happens. It should be a signature line in the game. The cockatoo should NOT echo or repeat what the child says. He has his own short lines instead.

## Goals

- A kid can pick it up and play with no reading and no instructions beyond a quick hint.
- The main activity is feeding dinosaurs.
- Lots of silly, funny animations. Animation quality matters a lot.
- Runs well on an Android Galaxy tablet (Chrome or Samsung Internet) as an installable PWA.

## Non-goals (version one)

- No dinosaurs eating each other or eating people. Dinosaurs are friendly, with some playful wildness (for example, a T-rex wanting a fruit and the cockatoo stealing it and flying off laughing).
- No tilt or motion controls. Everything uses on-screen buttons.
- No accounts, no online features, no ads, no in-app purchases.
- No failing or game over. Mistakes just make things take a little longer.

## Anti-goals (would be a failure even if it works)

- Anything scary, violent, or too intense for a young child.
- Controls that are hard to learn or need precise timing.
- Heavy loading times or a game that is hard to run on a tablet.
- A camera that makes the screen spin and makes the child dizzy.

## Platform and delivery

- **Target device:** Android Galaxy tablet. The developer should also check that it works in Chrome on a regular Android phone.
- **Delivery:** Progressive Web App (PWA) hosted on GitHub Pages.
- **Install:** Chrome and Samsung Internet on Android can install PWAs. Show a clear "Install app" button in the game (use the browser's install prompt where available), so it opens full screen from the home screen like a regular app.
- **Audio:** Sound needs a user tap before it can play. The game starts on a big "Play" screen.
- **Rendering:** Three.js (WebGL). Keep the game lightweight so it runs smoothly on a tablet.
- **Offline:** Use a service worker so the game opens without internet once installed.

## Movement (free flight, made easier)

The cockatoo can fly freely in any direction inside the play area, but the game helps keep it simple:

- **Play area:** a large, bounded area (a sky over the world). He can't fly off the edge.
- **Soft edges:** when he gets near the boundary, he gently turns back toward the middle. No hard wall or bump.
- **Speed cap:** his top speed is moderate and easy to control. Stunts and boosts are short and don't change his speed for long.
- **Gentle hover:** when the player lets go of Fly, he slowly glides down and levels out. He never falls fast or crashes.
- **Auto-level:** after a turn, he eases back to flying level, so he doesn't end up stuck upside down unless the player chooses a stunt.
- **Feed assist:** when he's near a hungry dinosaur, the Feed button appears and he slows slightly, so the feeding is easy to time.

## Controls (buttons only, no tilt)

- **Fly:** hold to rise, release to glide down.
- **Left / Right:** hold to turn.
- Movement is free within the play area, but made easier (see Movement below).
- **Feed:** shows up when the cockatoo is close enough to a hungry dinosaur. Pressing it drops or tosses a fruit into the dinosaur's mouth.
- **Catch:** shows up when he's close to a bug. Pressing it snaps up the bug as a snack.
- **Stunt:** performs a stunt (barrel roll or upside-down flip). Has a short cooldown so it can't be spammed.

## Core loop

1. The cockatoo flies through a bright, colorful world (islands, jungles, volcanoes, and similar).
2. Hungry baby dinosaurs are spread around the world. Each one shows a thought bubble with the food it wants (fruit, and so on).
3. He flies to a dinosaur and presses **Feed**. A fruit is tossed in an arc and the dinosaur catches and eats it.
4. The dinosaur does a silly reaction (see below).
5. The level ends when all dinosaurs in it are full. Confetti plays and the next level starts.

Feeding can happen while flying. He doesn't need to land.

### Three ways to give flying a reason (level types)

These are different kinds of levels. Version one can start with one or two.

1. **Feed the Dino Baby Crew (recommended first level):** A hungry dino family in each level. Fill all their bellies to finish.
2. **Delivery race:** Deliver food across the map before the timer runs out. The timer is generous and never causes a failure.
3. **Storm rescue:** A storm is coming. He carries baby dinosaurs to safety one at a time.

## Bug catching (snacks)

Part of version one, built into free flight. Not a separate minigame.

- **Where:** small swarms of glowing bugs float through the sky, mostly near the dinosaurs and along the flight path.
- **Catching:** when Lucky gets close to a bug, a **Catch** button appears, just like the Feed button. Pressing it makes him snap up the bug with a quick gobble animation, and the bug wiggles before it disappears.
- **Snacks:** each bug adds one snack to a small on-screen counter. Snacks are a bonus, not required. They unlock a special stunt or a new crest color, so there's a reason to catch them without any pressure.
- **Easy mode:** bugs drift slowly and are big and bright. The Catch button appears generously, and missing a bug just means it floats away. No failure.
- **Silly moments:** a caught bug can trigger "Fastooka!" or a crest shake.
- **Removable:** if it doesn't feel good in play, it can be cut without affecting the rest of the game.

## Silly moments (scripted animations, not physics)

Each one is a scripted sequence (timed movements, squash-and-stretch, and so on). No physics engine is needed.

- A dinosaur sneezes when he flies too close, and the sneeze blows him backward.
- A dinosaur tries to catch him with its tongue and misses.
- A fruit bounces off a dinosaur's head and rolls away, and everyone chases it.
- A dinosaur is surprised when it bites something and the thing wiggles.
- When a dinosaur is full, it does a little happy dance.
- He fluffs out his yellow crest when he's happy, and the crest shakes.
- After a successful feed, he sometimes does a surprise stunt on his own.
- Any silly moment can trigger **"Fastooka!"** (shown as a word bubble, with a sound if audio is on).

## Stunts

- **Barrel roll:** a smooth spin around his flying direction, about one second long.
- **Upside-down flip:** a smooth flip so his face is visible while he's upside down.
- Stunts are triggered by the Stunt button, and sometimes by the game after a feed.
- **The camera stays level during stunts.** Only the cockatoo spins, so the screen doesn't spin.
- Stunts never cost the player anything and don't stop feeding.

## Camera

- Third-person camera that floats just behind and above the cockatoo and follows smoothly.
- Turns a little with him when he banks, and pulls back slightly when he speeds up.
- Always keeps him clearly visible, with nearby dinosaurs and fruit visible as he passes.

## Characters and visuals

- **Cockatoo:** white body and wings, yellow crest that flares when happy, grey beak and grey feet, big dark eyes. Should match the look of the plush toy.
- **Dinosaurs:** friendly, colorful, cute, and simple in shape, with a few different types (version one: about three).
- **Fruit:** bright and easy to see.
- **World:** bright, colorful, and simple, with islands, jungles, and volcanoes.
- **Building the models:** either build the cockatoo and dinosaurs from simple shapes in code (lightweight, easy to tweak), or use free, licensed 3D models. Check the license before using any model.

## Animations

- **Flying:** wings flap in a steady loop, slowing as he glides. He tilts into turns.
- **Feeding:** a quick dive, a fruit arc, and a pull-up.
- **Dinosaur reactions:** happy bounce, chew wobble, sneeze push, dance when full.
- **Small touches:** blinking eyes, crest flare, confetti at the end of a level.
- **Stunts:** barrel roll and upside-down flip as described above.
- Animation quality is a top priority. Smooth easing, clean timing, and consistent squash-and-stretch.

## Version one scope

- One world with one level type (Feed the Dino Baby Crew).
- Three dinosaur types.
- Five or six silly moments.
- Fly, Left/Right, Feed, Catch, and Stunt buttons.
- Bug catching with snacks (see the Bug catching section).
- Free flight in a bounded play area with the easy-mode movement assists.
- Play screen, install button, offline support (PWA).
- Smooth camera, and the cockatoo's flying, feeding, and stunt animations.

Everything else (the other two level types, more worlds, and more dinosaurs) comes later.

## Decisions made by the designer (my call, to be checked)

- Bug catching is **included in version one** as a snack bonus. It's easy to cut if it doesn't feel good in play.
- Dinosaurs are friendly, not predators, for a young child.
- The cockatoo never echoes or repeats what the child says.
- Stunts are triggered by a button and sometimes by the game, with a cooldown.

## Open questions

1. **Title:** "Lucky's Dino Feast" is the working title and can be changed.

## Decided (continued)

- **Bug catching:** included in version one as a snack bonus (see the Bug catching section).
- **Character name:** Lucky.

## Decided

- **Movement:** free flight inside a bounded play area, with the easy-mode assists in the Movement section (soft edges, speed cap, gentle hover, auto-level, feed assist).

## Notes for the builder

- The game is a surprise, so the child can't be asked for input during development.
- Keep the code simple and well organized, since the project may grow.
- Use a simple, clean project structure that works with GitHub Pages (no server needed).
