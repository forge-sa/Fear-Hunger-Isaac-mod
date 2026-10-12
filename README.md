# Isaac × Fear & Hunger

An unofficial fan mod for **Fear & Hunger** (2018) that adds **Isaac**, the
crying child from *The Binding of Isaac*, as a recruitable companion.

> Somewhere beneath your feet, a child is sobbing.

After the intro, once you've walked around for a bit, a rotten trapdoor bursts
open and Isaac crawls out. Take him with you, tell him "not now" (he'll find
you again later), or abandon him for good.

## What he brings

| | |
|---|---|
| **Tears** | Free. Two tears at one body part (about one normal Attack's worth). It's also his Attack while he has no weapon. |
| **Brimstone** | A blood laser through *every* body part at once. 60 Mind, 85% to hit each part, and his eyes bleed (15% Body, never lethal). |
| **Yum Heart** | Heals 40% of an ally's Body. |
| **The D6** | Battle only. Rolls 1–6: a cursed nosebleed, nothing, a free Pill, a small party heal, a free Bomb, or a big party heal. |
| **Bomb** (item) | Damages every body part. He gives you one. |
| **Pill** (item) | One of 10 random effects (Full Health, Bad Trip, Hematemesis, Balls of Steel…). He gives you two. |

Stats come from the game's own cast: fragile (70 Body), but more Mind (120),
luck and agility than anyone else. He can equip any weapon or armor.

### Fits into the game's systems

Fear & Hunger tracks companions by hard-coded actor IDs, so the mod wires
Isaac in the same way the game handles the girl, Le'garde and the others:

- **Hunger**: his stomach drains exactly like other companions' (EXP 57–156,
  one point every 800 frames, faster with parasites). He gets the same hunger
  messages and the same *Hunger LVL* states and max-Body cuts, and he can
  starve to death. Feed him food from the menu.
- **Party limit**: he counts toward `PartySize`, so recruit checks still cap
  the party at 4.
- **Death is permanent**: when he's knocked out, he leaves the party after the
  battle, like `deathCheck` does for other companions.
- **The game's look**: a 230px back-view battler for the front-view battles
  (the party is shown from behind), an 80×110 map sprite, menu busts for
  `GALV_BustMenu`, and dialogue in the game's style (grey name, quoted line,
  no portrait). His portrait and bust get bloodier as his Body drops.

Everything is looked up by name (`START`, `PartySize`, `Hunger LVL 1`,
`Party_Check`…). Anything it can't find is skipped, so the plugin also runs in
other RPG Maker MV games without the Fear & Hunger parts.

All art and sound were made from scratch by the scripts in `tools/`. Nothing
is taken from either game.

## Install

Requires [Node.js](https://nodejs.org) (any recent version).

```sh
node install.js                          # finds the Steam install by itself
node install.js "/path/to/Fear & Hunger" # or point it at the game folder
```

This copies `mod/www/*` into the game's `www/` folder and registers `IsaacMod`
at the end of `www/js/plugins.js`. The first time, it saves the original as
`plugins.js.before-isaacmod`. Running it again is safe. Add `--dry-run` to
see what it would do.

**Manual install:** copy everything in `mod/www/` into the game's `www/`
folder, then add this line as the last entry of the list in
`www/js/plugins.js`:

```js
{"name":"IsaacMod","status":true,"description":"","parameters":{}}
```

**Uninstall:** `node install.js --uninstall`. Saves made while Isaac was in
the party won't load without the mod.

## Settings

Edit the `IsaacMod` entry's `parameters` in `www/js/plugins.js`. Values are
strings; the defaults are shown below.

| Parameter | Default | |
|---|---|---|
| `Steps Before Encounter` | `60` | Steps after the intro before the trapdoor opens |
| `Steps Before Re-offer` | `200` | After "Not now" |
| `Auto Encounter` | `true` | `false` = only via plugin command |
| `Max Party Size` | `4` | No encounter while the party is full |
| `Skill Type Name` | `Skills` | Reuses the game's menu of that name |
| `Allow Equipment` | `true` | |
| `Dynamic Face` | `true` | Bloodier portrait/bust as Body drops |
| `Hunger` | `true` | `false` = he never gets hungry |

Plugin commands (from any event): `IsaacMod encounter`, `IsaacMod join`,
`IsaacMod leave`, `IsaacMod items`, `IsaacMod reset`.

## How it works

`mod/www/js/plugins/IsaacMod.js` is a single ES5 plugin. When the database
finishes loading (before YEP parses notetags), it appends Isaac's actor,
class, skills, items, 12 animations and 2 common events. It also patches
`Party_Check` in memory and lets the mod's own unencrypted `.png`/`.ogg`
files bypass the game's decrypter. No game files are edited. Isaac's IDs
come from the end of each list, so they stay the same as long as the game's
data doesn't change.

## Development

```sh
npm install          # acorn, used for the ES5 syntax check
npm run build        # regenerate all images and sounds (sounds need ffmpeg)
npm test
```

`npm test` runs the plugin inside the open-source MV engine
([rpgtkoolmv/corescript](https://github.com/rpgtkoolmv/corescript), fetched
into `test/.corescript` on first run) against fixture databases. If Fear &
Hunger is installed, it also runs against the real game read-only: the game's
own engine scripts, its enabled plugins, and its real database (`test/real.js`).
The tests are headless, so nothing is drawn on screen. Playing it for real is
still the final check.

## Credits

*The Binding of Isaac* and Isaac belong to Edmund McMillen and Nicalis.
*Fear & Hunger* belongs to Miro Haverinen. This fan mod is not affiliated
with either.
