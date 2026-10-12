'use strict';
// Runs IsaacMod against an installed copy of Fear & Hunger: the game's own
// engine scripts, its enabled plugins (in its order, with its parameters)
// and its real database. Read-only; nothing in the game folder is touched.
//
//   node test/real.js ["/path/to/Fear & Hunger"]

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const PLUGIN = path.join(__dirname, '..', 'mod', 'www', 'js', 'plugins', 'IsaacMod.js');

function findGame() {
  const candidates = [process.argv[2], process.env.FH_GAME,
    path.join(os.homedir(), '.local/share/Steam/steamapps/common/Fear & Hunger')].filter(Boolean);
  for (const c of candidates) {
    const www = fs.existsSync(path.join(c, 'www')) ? path.join(c, 'www') : c;
    if (fs.existsSync(path.join(www, 'js', 'plugins.js'))) return www;
  }
  return null;
}

const WWW = findGame();
if (!WWW) {
  console.log('[real] skipped: Fear & Hunger not found (pass its folder as an argument)');
  process.exit(0);
}

let passes = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) passes++;
  else failures.push(name + (detail !== undefined ? ' — ' + JSON.stringify(detail) : ''));
}
function section(name, fn) {
  try { fn(); } catch (e) { failures.push(name + ' threw: ' + (e && e.stack || e)); }
}

// --- browser stubs (same idea as test/mv.js) -------------------------------
function stub(name) {
  const fn = function () {};
  return new Proxy(fn, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === 'symbol') return undefined;
      t[k] = stub(name + '.' + String(k));
      return t[k];
    },
  });
}
global.window = global;
global.PIXI = stub('PIXI');
Object.defineProperty(global, 'navigator', { value: { userAgent: 'node', platform: 'node' }, configurable: true, writable: true });
const el = () => ({ style: {}, appendChild() {}, addEventListener() {}, getContext: () => null, setAttribute() {}, canPlayType: () => '' });
global.document = { createElement: el, getElementById: () => null, addEventListener() {}, body: el(), getElementsByTagName: () => [], querySelector: () => null };
global.location = { search: '', href: 'http://localhost/index.html' };
global.requestAnimationFrame = () => 0;
global.Image = function () { this.addEventListener = () => {}; };
global.XMLHttpRequest = function () { this.open = (m, u) => { this.url = u; }; this.send = () => {}; this.overrideMimeType = () => {}; };

const run = (file) => vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: path.basename(file) });
for (const f of ['rpg_core', 'rpg_managers', 'rpg_objects', 'rpg_scenes', 'rpg_sprites', 'rpg_windows']) {
  run(path.join(WWW, 'js', f + '.js'));
}
AudioManager.playSe = function () {};
AudioManager.playStaticSe = function () {};
SoundManager.playActorDamage = function () {};
const pictures = [];
ImageManager.loadPicture = (n) => { pictures.push(n); return { width: 182, height: 360, name: n }; };
ImageManager.reserveSystem = () => {};
ImageManager.loadSystem = (n) => ({ name: n });

// --- the game's plugins, then the mod ---------------------------------------
const pluginsSrc = fs.readFileSync(path.join(WWW, 'js', 'plugins.js'), 'utf8');
global.$plugins = vm.runInNewContext(pluginsSrc.replace('var $plugins', 'this.$plugins') + ';this.$plugins', {});
const loaded = [];
const broken = [];
PluginManager._parameters = {};
for (const p of $plugins) {
  if (!p.status) continue;
  PluginManager._parameters[p.name.toLowerCase()] = p.parameters;
  try {
    run(path.join(WWW, 'js', 'plugins', p.name + '.js'));
    loaded.push(p.name);
  } catch (e) {
    broken.push(p.name + ': ' + String(e.message).slice(0, 80));
  }
}
PluginManager._parameters.isaacmod = {};
run(PLUGIN);

// --- database ----------------------------------------------------------------
const read = (f) => JSON.parse(fs.readFileSync(path.join(WWW, 'data', f), 'utf8'));
for (const f of DataManager._databaseFiles) {
  window[f.name] = read(f.src);
  DataManager.onLoad(window[f.name]);
}
let dbOk = false;
section('notetag plugins', () => { dbOk = DataManager.isDatabaseLoaded(); });

const ids = IsaacMod.ids;
section('boot', () => {
  check('database loads with every plugin', dbOk);
  check('plugins loaded headless: ' + loaded.length + ' (could not: ' + broken.length + ')', loaded.length > 30, broken);
  check('mod ready', IsaacMod._ready === true, String(IsaacMod._error));
  check('Isaac is actor #' + ids.actor + ' after the game\'s ' + ($dataActors.length - 2), $dataActors[ids.actor].name === 'Isaac');
  check('uses the game\'s Skills menu', ids.stype === 1, $dataSystem.skillTypes);
  check('front view with visible party sprites detected (YEP Front Actor Sprite)', IsaacMod.view.sideView === false && IsaacMod.view.actorsVisible === true, IsaacMod.view);
  check('ally animations play on the actor', $dataAnimations[ids.animHeart].position === 1);
  // YEP turns repeats into ACTION EFFECT steps; a custom <Target Action>
  // notetag (the game's Attack has one) replaces them.
  const hits = (s) => (s.targetActions || []).filter((x) => /^action effect$/i.test(x[0])).length * s.repeats;
  check('Tears hits ' + hits($dataSkills[ids.skillTears]) + 'x vs the game\'s Attack ' + hits($dataSkills[1]) + 'x',
    hits($dataSkills[ids.skillTears]) === 2 && hits($dataSkills[1]) === 1);
  const F = IsaacMod.fh;
  check('F&H detected: START, PartySize, hunger, deathCheck', F.startSwitch === 79 && F.partySizeVar === 34 && F.hunger && F.deathCheck && F.partyCheck, F);
  const st = IsaacMod.stats.params;
  check('stats ' + st.join('/') + ' (Body/Mind/Atk/Def/Mat/Mdf/Agi/Luk)', st[0] === 70 && st[1] === 120);
  check('EXP curve copied', JSON.stringify($dataClasses[ids.classId].expParams) === '[19,38,50,10]');
  check('YEP processed Isaac\'s skills', !!$dataSkills[ids.skillBrimstone].targetActions || !!$dataSkills[ids.skillBrimstone].setupActions, Object.keys($dataSkills[ids.skillBrimstone]));
  console.log('   tears:     ' + $dataSkills[ids.skillTears].damage.formula);
  console.log('   brimstone: ' + $dataSkills[ids.skillBrimstone].damage.formula + ' (' + $dataSkills[ids.skillBrimstone].mpCost + ' Mind)');
  console.log('   bomb:      ' + $dataItems[ids.itemBomb].damage.formula);
});

// --- a game in progress -------------------------------------------------------
section('new game', () => {
  DataManager.createGameObjects();
  $gameParty.setupStartingMembers();
  window.$dataMap = read('Map' + String($dataSystem.startMapId).padStart(3, '0') + '.json');
  DataManager.extractMetadata($dataMap);
  $gameMap.setup($dataSystem.startMapId);
  $gamePlayer.locate($dataSystem.startX, $dataSystem.startY);
  $gameActors.actor(1).changeExp(57 + 99, false);   // what Map010 does at the start
  check('started as ' + $gameParty.leader().name(), $gameParty.size() === 1);
});

function runCommonEvent(id) {
  const it = new Game_Interpreter();
  it.setup($dataCommonEvents[id].list);
  for (let i = 0; i < 20000 && it.isRunning(); i++) {
    it.update();
    if ($gameMessage.isBusy()) $gameMessage.clear();
  }
  return !it.isRunning();
}

const isaac = () => $gameActors.actor(ids.actor);
section('recruit', () => {
  $gameSwitches.setValue(79, true);
  for (let i = 0; i < 60; i++) $gameParty.increaseSteps();
  check('encounter becomes available', IsaacMod.canEncounter());
  const it = new Game_Interpreter();
  it.setup($dataCommonEvents[ids.ceEncounter].list);
  for (let i = 0; i < 5000 && it.isRunning(); i++) {
    it.update();
    if ($gameMessage.isBusy()) {
      if ($gameMessage.isChoice()) $gameMessage.onChoice(0);
      $gameMessage.clear();
    }
  }
  check('Isaac joined', IsaacMod.isInParty() && $gameParty.size() === 2);
  check('full stomach (156)', isaac().currentExp() === 156, isaac().currentExp());
  check('Party_Check counts him', runCommonEvent(49) && $gameVariables.value(34) === 2, $gameVariables.value(34));
});

section('menu bust (GALV_BustMenu)', () => {
  const win = { width: 816, standardPadding: () => 18, maxCols: () => 4, contents: { unlimitedBlt() {} }, bustWidth: Window_MenuStatus.prototype.bustWidth };
  pictures.length = 0;
  Window_MenuStatus.prototype.drawFace.call(win, isaac().faceName(), isaac().faceIndex(), 0, 0, 144, 144);
  check('menu loads img/pictures/Isaac_1', pictures[0] === 'Isaac_1', pictures);
  isaac().setHp(10);
  pictures.length = 0;
  Window_MenuStatus.prototype.drawFace.call(win, isaac().faceName(), isaac().faceIndex(), 0, 0, 144, 144);
  check('hurt Isaac shows a bloodied bust', pictures[0] === 'Isaac_3', pictures);
  isaac().recoverAll();
});

section('food', () => {
  const egg = $dataItems.findIndex((i) => i && i.name === 'Egg');
  const a = new Game_Action($gameParty.leader());
  a.setItemObject($dataItems[egg]);
  isaac().changeExp(120, false);
  a.apply(isaac());
  check('an Egg feeds Isaac (+7)', isaac().currentExp() === 127, isaac().currentExp());
  check('the game\'s FOOD_small still runs', runCommonEvent(31));
});

section('battle', () => {
  $gameTroop.setup(1);
  $gameParty.onBattleStart();
  $gameTroop.onBattleStart();
  BattleManager._logWindow = { push() {} };
  // Battle sprites normally create YEP's popup queues on their first frame.
  $gameParty.members().concat($gameTroop.members()).forEach((b) => b.isDamagePopupRequested());
  const enemies = $gameTroop.members();
  check('troop 1: ' + enemies.map((e) => e.name()).join(', '), enemies.length > 1);
  const me = isaac();
  check('unarmed attack is Tears (WeaponSkill still loaded)', me.attackSkillId() === ids.skillTears);
  const torso = enemies.reduce((a, b) => (b.mhp > a.mhp ? b : a));
  const hp0 = torso.hp;
  const t = new Game_Action(me);
  t.setAttack();
  t.setTarget(enemies.indexOf(torso));
  const targets = t.makeTargets();
  const realRandom = Math.random;
  Math.random = () => 0.3;
  targets.forEach((x) => t.apply(x));
  check('Tears: ' + targets.length + ' tears, ' + (hp0 - torso.hp) + ' damage to ' + torso.name() + ' (' + hp0 + ' HP)', torso.hp < hp0);
  const b = new Game_Action(me);
  b.setSkill(ids.skillBrimstone);
  const all = b.makeTargets();
  all.forEach((x) => b.apply(x));
  check('Brimstone hit ' + all.filter((x) => x.result().isHit()).length + '/' + all.length + ' parts', all.some((x) => x.result().hpDamage > 0));
  check('Brimstone cost Isaac some Body (' + me.hp + '/' + me.mhp + ')', me.hp < me.mhp && me.hp > 0);
  Math.random = realRandom;
  $gameParty.onBattleEnd();
});

section('save', () => {
  const json = JsonEx.stringify(DataManager.makeSaveContents());
  DataManager.createGameObjects();
  DataManager.extractSaveContents(JsonEx.parse(json));
  check('save/load keeps Isaac', IsaacMod.isInParty() && isaac().name() === 'Isaac');
});

console.log('[real] ' + passes + ' checks passed' + (failures.length ? ', ' + failures.length + ' failed' : '') + '  (' + WWW + ')');
failures.forEach((f) => console.log('   FAIL ' + f));
if (broken.length) console.log('   note: plugins that need a real browser to load: ' + broken.map((b) => b.split(':')[0]).join(', '));
process.exit(failures.length ? 1 : 0);
