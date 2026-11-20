# ROLL'EM

**Roll a letter. Beat the clock. Hit the board.**

ROLL'EM is a pass-and-play party word game for 2–12 players on one phone. It mixes a letter-and-timer race, category answers and a top-5 survey board.

## How a turn works
1. Tap the 23-sided die (A–W, no X/Y/Z) to roll your letter.
2. Answer the prompt (e.g. *"A fruit"*) with something that starts with that letter. Type it or tap the mic to say it.
3. Tap **Lock it in**. If your spelling is slightly off, it gets autocorrected, and you tap **Submit** to confirm.
4. The survey board flips over to show the top 5 answers from "100 people".

## Modes
**Unlimited** mixes every category. There are also topic modes: Food & Drink, Animals & Nature, People & Places, Pop Culture, Home & Everyday, Life & Occasions, Describe It, and **After Dark** (PG-13: bars, dating, bad habits). Unlimited can be set to PG-13 (includes After Dark) or Family.

## Customize
Choose from 12 menu themes and 13 dice designs (Classic, Ruby, Onyx, Gold, Sapphire, Mint, Bubblegum, Marble, Wood, Neon, Galaxy, Lava, Lakers). Each player can also pick their own dice from the dice button on their row in setup; it's used on their turns.

## Scoring
| Result | Points |
|---|---|
| Matches a top-5 board answer | Its survey number (6–44) |
| Valid answer that isn't on the board | 5 |
| Unknown answer the next player accepts | 5 (in **Strict** mode, unknown answers score 0 and there's no judging) |
| Speed bonus (board hits only) | up to +10 for answering fast |
| Streak bonus | +5 / +10 / +15 for consecutive board hits |
| Final round | everything ×2 (or ×3) |

Prompts are picked least-recently-used, and that history is remembered across games, so the same prompt won't come back for a long time. Each player gets one **reroll** per game, but the clock keeps running. Letters with fewer prompts (like Q) come up less often. The starting player rotates every round.

## Play it
It's a static web app with no build step and no server code.

- **Locally:** run `python3 -m http.server` in this folder, then open `http://localhost:8000`.
- **On phones:** host the folder on any static host (GitHub Pages works: Settings → Pages → deploy from branch). Open the URL on a phone and use **Add to Home Screen** to install it as an app. It works offline after the first visit.

Voice input uses the browser's built-in speech recognition (Chrome on Android, Safari on iOS 14.5+). If the browser's speech service isn't available (for example in some home-screen apps, or offline), the mic button opens the keyboard so you can use its built-in dictation 🎤 instead.

## Project layout
```
index.html            screens and markup
css/style.css         all styling and animation
js/engine.js          pure game logic: matching, autocorrect, scoring, prompt picking
js/app.js             screen flow / UI controller
js/audio.js           synthesized sound effects, adaptive tension music and haptics (no audio files)
js/fx.js              confetti and particle canvas
js/die3d.js           WebGL rounded-cube die (CSS cube fallback)
js/data/*.js          prompt packs (199 categories)
js/data/_topics.js    game modes and the topic of each category
js/themes.js          12 menu themes and 12 dice designs
tools/validate-data.js  checks prompt packs
tools/test-engine.js    engine unit tests and data cross-checks
tools/smoke.js          headless full-game playthrough with screenshots
tools/perf.js           frame pacing of the dice roll under CPU throttling (low-end phone check)
```

## Adding prompts
Each pack calls `window.ROLLEM_DATA.push({ id, prompt, answers: { A: [...], B: [...] } })`.
- Order each letter's answers from most to least popular. The first 5 become the board, and the rest are accepted as valid off-board answers.
- Use `"Display|alias|alias"` to accept alternate spellings.
- Only include a letter if it has at least 6 good answers. The die only pairs a letter with prompts that have answers for it, so a roll can never be impossible.

Run `node tools/validate-data.js && node tools/test-engine.js` after editing.
