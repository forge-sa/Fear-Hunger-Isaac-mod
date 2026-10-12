'use strict';
// Runs IsaacMod.js inside the real RPG Maker MV engine code (headless) against
// a Fear & Hunger-shaped database. Each scenario gets a fresh process because
// plugins patch the engine globally.
//
//   node test/run.js            run everything
//   MV_CORESCRIPT=/path node …  use an existing corescript checkout

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PLUGIN = path.join(ROOT, 'mod', 'www', 'js', 'plugins', 'IsaacMod.js');
const WWW = path.join(ROOT, 'mod', 'www');

const SCENARIOS = ['static', 'main', 'late', 'order', 'hunger'];

if (!process.argv[2]) {
  require('./mv').ensureCorescript();  // fetch once, before the scenarios fan out
  let failed = 0;
  for (const s of SCENARIOS) {
    const r = spawnSync(process.execPath, [__filename, s], { stdio: 'inherit', env: process.env });
    if (r.status !== 0) failed++;
  }
  // Against an installed copy of the game, when there is one.
  const real = spawnSync(process.execPath, [path.join(__dirname, 'real.js')], { stdio: 'inherit', env: process.env });
  if (real.status !== 0) failed++;
  console.log(failed ? '\n' + failed + ' scenario(s) FAILED' : '\nall scenarios passed');
  process.exit(failed ? 1 : 0);
}

// ---------------------------------------------------------------------------

let passes = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) passes++;
  else failures.push(name + (detail !== undefined ? ' — ' + JSON.stringify(detail) : ''));
}
function section(name, fn) {
  try {
    fn();
  } catch (e) {
    failures.push(name + ' threw: ' + (e && e.stack || e));
  }
}
function finish(scenario) {
  console.log('[' + scenario + '] ' + passes + ' checks passed' + (failures.length ? ', ' + failures.length + ' failed' : ''));
  failures.forEach((f) => console.log('   FAIL ' + f));
  process.exit(failures.length ? 1 : 0);
}

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

function shuffled(arr, seed) {
  const a = arr.slice();
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function boot(opts) {
  const mv = require('./mv');
  const { makeDatabase, addFearAndHunger } = require('./fixtures');
  mv.bootEngine();
  global.__reserved = [];
  ImageManager.reserveSystem = (name) => global.__reserved.push(name);
  ImageManager.loadSystem = (name) => ({ fake: true, name });
  // Stand-in for a YEP-style plugin that parses notetags once everything has
  // loaded; it must see Isaac's entries too.
  const _isLoaded = DataManager.isDatabaseLoaded;
  DataManager.isDatabaseLoaded = function () {
    if (!_isLoaded.call(this)) return false;
    if (!global.__processed) {
      global.__processed = true;
      [$dataSkills, $dataItems, $dataActors, $dataClasses].forEach((arr) => arr.forEach((o) => {
        if (o) { o.fakeProcessed = true; o.setupActions = ['default']; }
      }));
    }
    return true;
  };
  if (opts.stubBootStart) Scene_Boot.prototype.start = function () {};
  if (opts.before) opts.before();
  mv.loadPlugin(PLUGIN, opts.params || {});
  const db = makeDatabase();
  if (opts.fh) global.__fh = addFearAndHunger(db);
  const files = opts.order ? shuffled(DataManager._databaseFiles, opts.order) : DataManager._databaseFiles;
  for (const f of files) {
    window[f.name] = clone(db[f.name]);
    if (!opts.skipOnLoad) DataManager.onLoad(window[f.name]);
  }
  return db;
}

function startGame() {
  const { makeMap } = require('./fixtures');
  DataManager.createGameObjects();
  $gameParty.setupStartingMembers();
  window.$dataMap = makeMap();
  $gameMap.setup(1);
  $gamePlayer.locate(5, 5);
}

// Runs the map interpreter until idle, answering choices with `choice`.
function runInterpreter(choice) {
  const shown = [];
  for (let guard = 0; guard < 5000; guard++) {
    if (!$gameMap._interpreter.isRunning()) {
      if (!$gameMap.setupStartingEvent()) break;
    }
    $gameMap._interpreter.update();
    if ($gameMessage.isBusy()) {
      shown.push({ face: $gameMessage.faceName(), index: $gameMessage.faceIndex(), text: $gameMessage._texts.slice(), choices: $gameMessage.choices().slice() });
      if ($gameMessage.isChoice()) $gameMessage.onChoice(choice);
      $gameMessage.clear();
    }
  }
  return shown;
}

function logRecorder() {
  const lines = [];
  return { lines, push(method, text) { if (method === 'addText') lines.push(text); } };
}

function visibleLength(line) {
  return line.replace(/\\I\[\d+\]/g, '___').replace(/\\[A-Z]\[\d+\]/gi, '').length;
}

// ---------------------------------------------------------------------------
const scenario = process.argv[2];

if (scenario === 'static') {
  const acorn = require('acorn');
  const src = fs.readFileSync(PLUGIN, 'utf8');
  section('ES5 syntax', () => {
    acorn.parse(src, { ecmaVersion: 5 });
    check('plugin parses as ES5 (old NW.js builds)', true);
  });
  check('plugin header has @plugindesc', /@plugindesc/.test(src));
  ['img/characters/$Isaac.png', 'img/sv_actors/Isaac.png', 'img/faces/Isaac.png', 'img/system/IsaacIcons.png', 'img/animations/IsaacFX.png']
    .concat([1, 2, 3, 4, 5, 6, 7, 8].map((i) => 'img/pictures/Isaac_' + i + '.png')).forEach((f) => {
    check('asset exists: ' + f, fs.existsSync(path.join(WWW, f)));
  });
  const se = fs.readdirSync(path.join(WWW, 'audio', 'se'));
  const referenced = Array.from(new Set((src.match(/'Isaac_[A-Za-z]+'/g) || []).map((s) => s.slice(1, -1))));
  referenced.forEach((n) => {
    check('sound exists: ' + n + '.ogg', se.indexOf(n + '.ogg') >= 0);
    check('sound exists: ' + n + '.m4a', se.indexOf(n + '.m4a') >= 0);
  });
  const png = (f) => {
    const b = fs.readFileSync(path.join(WWW, f));
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  };
  check('map sprite is 3x4 cells of 80x110 (like the game\'s)', JSON.stringify(png('img/characters/$Isaac.png')) === '{"w":240,"h":440}');
  check('battler is 9x6 cells of 230px (like the game\'s)', JSON.stringify(png('img/sv_actors/Isaac.png')) === '{"w":2070,"h":1380}');
  check('busts are 182x360 (like the game\'s)', [1, 2, 3, 4, 5, 6, 7, 8].every((i) => JSON.stringify(png('img/pictures/Isaac_' + i + '.png')) === '{"w":182,"h":360}'));
  check('face sheet is 4x2 faces of 144px', JSON.stringify(png('img/faces/Isaac.png')) === '{"w":576,"h":288}');
  const fx = png('img/animations/IsaacFX.png');
  check('fx sheet is 5 columns of 192px', fx.w === 960 && fx.h % 192 === 0, fx);
  finish(scenario);
}

if (scenario === 'main') {
  boot({});
  section('injection', () => {
    check('database loaded', DataManager.isDatabaseLoaded());
    check('mod ready', IsaacMod._ready === true, String(IsaacMod._error));
    const ids = IsaacMod.ids;
    check('actor appended after existing actors', ids.actor === 7, ids.actor);
    check('class appended', ids.classId === 6, ids.classId);
    check('reuses the game\'s Skills menu', ids.stype === 1 && $dataSystem.skillTypes.length === 3, $dataSystem.skillTypes);
    check('skills appended', ids.skillTears === 3 && ids.skillD6 === 6, [ids.skillTears, ids.skillD6]);
    check('items appended', ids.itemBomb === 2 && ids.itemPill === 3, [ids.itemBomb, ids.itemPill]);
    check('common events appended', ids.ceEncounter === 2 && ids.ceMessage === 3);
    check('ids match array positions', $dataActors[ids.actor].id === ids.actor && $dataSkills[ids.skillTears].id === ids.skillTears);
    check('actor is Isaac', $dataActors[ids.actor].name === 'Isaac' && $dataActors[ids.actor].characterName === '$Isaac');
    check('metadata extracted', !!$dataSkills[ids.skillBrimstone].meta && !!$dataActors[ids.actor].meta);
    check('notetag plugins processed Isaac\'s entries', $dataSkills[ids.skillD6].fakeProcessed === true && $dataItems[ids.itemPill].fakeProcessed === true);
    check('icon sheet preloaded', global.__reserved.indexOf('IsaacIcons') >= 0, global.__reserved);
    const st = IsaacMod.stats;
    check('stats derived from cast medians', st.params[0] === 70 && st.params[2] === 11 && st.params[7] === 16, st.params);
    check('weapon median', st.weaponAtk === 14, st.weaponAtk);
    const cls = $dataClasses[ids.classId];
    const has = (c, d) => cls.traits.some((t) => t.code === c && t.dataId === d);
    check('class keeps base hit rate', has(22, 0));
    check('class grants skill type', has(41, ids.stype));
    check('class can equip every weapon/armor type', has(51, 1) && has(51, 2) && has(52, 1) && has(52, 2));
    check('learns four skills at level 1', cls.learnings.length === 4 && cls.learnings.every((l) => l.level === 1));
    check('tears formula scales off the game\'s attack', $dataSkills[ids.skillTears].damage.formula === '((a.atk + 11) * 4 - b.def * 2) * 0.5', $dataSkills[ids.skillTears].damage.formula);
    check('bomb formula ignores the thrower', $dataItems[ids.itemBomb].damage.formula.indexOf('a.atk') < 0, $dataItems[ids.itemBomb].damage.formula);
  });

  section('animations', () => {
    const ids = IsaacMod.ids;
    const list = [ids.animTears, ids.animBrimstone, ids.animHeart, ids.animBomb, ids.animPill, ids.animD6Roll].concat(ids.animD6.slice(1));
    check('12 animations', list.length === 12 && list.every((id) => $dataAnimations[id] && $dataAnimations[id].id === id));
    const se = fs.readdirSync(path.join(WWW, 'audio', 'se'));
    list.forEach((id) => {
      const a = $dataAnimations[id];
      const cells = [].concat.apply([], a.frames);
      check(a.name + ': frames', a.frames.length > 0 && a.frames.every((f) => Array.isArray(f) && f.length > 0));
      check(a.name + ': cells in sheet', cells.every((c) => c.length === 8 && c[0] >= 0 && c[0] < 35), cells.map((c) => c[0]));
      check(a.name + ': timings in range', a.timings.every((t) => t.frame >= 0 && t.frame < a.frames.length));
      check(a.name + ': sounds exist', a.timings.every((t) => !t.se || se.indexOf(t.se.name + '.ogg') >= 0));
      check(a.name + ': position', [0, 1, 2, 3].indexOf(a.position) >= 0);
    });
    ['Tears', 'Brimstone', 'Yum Heart', 'The D6'].forEach((n, i) => {
      const s = $dataSkills[ids.skillTears + i];
      check(n + ' has a valid animation', s.name === n && !!$dataAnimations[s.animationId]);
    });
  });

  section('unencrypted assets', () => {
    ['img/characters/%24Isaac.png', 'img/faces/Isaac.png', 'img/system/IsaacIcons.png', 'img/animations/IsaacFX.png'].forEach((u) => {
      check('decrypter skips ' + u, Decrypter.checkImgIgnore(u) === true);
    });
    ['img/faces/Actor1.png', 'img/characters/%24BigMonster.png', 'img/faces/NotIsaac.png'].forEach((u) => {
      check('decrypter keeps ' + u, Decrypter.checkImgIgnore(u) === false);
    });
    check('original ignore list still works', Decrypter.checkImgIgnore('img/system/Window.png') === true);
    check('mod images bypass decryption at the URL ImageManager builds',
      Decrypter.checkImgIgnore(ImageManager._path ? 'img/characters/' + encodeURIComponent('$Isaac') + '.png' : 'img/characters/%24Isaac.png'));

    Decrypter.hasEncryptedAudio = true;
    WebAudio._initialized = true;
    let decoded = 0;
    WebAudio._context = { decodeAudioData: (arr, cb) => { decoded++; cb({ duration: 1 }); } };
    const realDecrypt = Decrypter.decryptArrayBuffer;
    let decrypted = 0;
    Decrypter.decryptArrayBuffer = function (b) { decrypted++; return b; };
    XMLHttpRequest.requests.length = 0;
    const mod = new WebAudio('audio/se/Isaac_Tear.ogg');
    const game = new WebAudio('audio/se/Cursor1.ogg');
    const urls = XMLHttpRequest.requests.map((x) => x.url);
    check('mod sound requested as plain .ogg', urls.indexOf('audio/se/Isaac_Tear.ogg') >= 0, urls);
    check('game sound still requested encrypted', urls.indexOf('audio/se/Cursor1.rpgmvo') >= 0, urls);
    XMLHttpRequest.requests.forEach((x) => { x.status = 200; x.response = new ArrayBuffer(32); x.onload(); });
    check('only the game sound was decrypted', decrypted === 1, decrypted);
    check('both sounds decoded', decoded === 2, decoded);
    check('decrypt flag restored', Decrypter.hasEncryptedAudio === true);
    Decrypter.decryptArrayBuffer = realDecrypt;
    void mod; void game;
  });

  startGame();
  const ids = IsaacMod.ids;

  section('encounter trigger', () => {
    check('no state before play', !$gameSystem._isaacMod);
    check('not yet: no steps', IsaacMod.canEncounter() === false);
    for (let i = 0; i < 59; i++) $gameParty.increaseSteps();
    check('not yet: 59 steps', IsaacMod.canEncounter() === false);
    $gameParty.increaseSteps();
    check('ready at 60 steps', IsaacMod.canEncounter() === true);
    $gameParty.addActor(2); $gameParty.addActor(3); $gameParty.addActor(4);
    check('blocked when party is full', IsaacMod.canEncounter() === false);
    $gameParty.removeActor(4); $gameParty.removeActor(3);
    $gameTemp.reserveCommonEvent(1);
    check('blocked while another event is queued', IsaacMod.canEncounter() === false);
    $gameTemp.clearCommonEvent();
    IsaacMod.updateEncounter();
    check('encounter queued', $gameTemp.isCommonEventReserved() && $gameTemp._commonEventId === ids.ceEncounter);
  });

  section('encounter: not now', () => {
    const shown = runInterpreter(1);
    const st = IsaacMod.state();
    check('scene played', shown.length >= 6, shown.length);
    check('Isaac speaks in the game\'s style', shown.some((m) => m.face === '' && m.text[0] === '\\c[7]Isaac\\c[0]'), shown[3]);
    check('offered three choices', shown.some((m) => m.choices.length === 3));
    check('Isaac not in party', !IsaacMod.isInParty());
    check('re-offer scheduled', st.nextOfferAt === st.steps + 200 && !st.refused, st);
    check('not offered again immediately', IsaacMod.canEncounter() === false);
    for (let i = 0; i < 200; i++) $gameParty.increaseSteps();
    check('offered again after 200 steps', IsaacMod.canEncounter() === true);
  });

  section('encounter: join', () => {
    IsaacMod.updateEncounter();
    const shown = runInterpreter(0);
    const texts = [].concat.apply([], shown.map((m) => m.text));
    check('Isaac joined', IsaacMod.isInParty() && $gameParty.size() === 3, $gameParty._actors);
    check('join message', texts.some((t) => t.indexOf('Isaac joined the party.') >= 0));
    check('got his bomb and pills', $gameParty.numItems($dataItems[ids.itemBomb]) === 1 && $gameParty.numItems($dataItems[ids.itemPill]) === 2);
    check('state says joined', IsaacMod.state().joined === true && IsaacMod.state().offers === 2);
    for (let i = 0; i < 1000; i++) $gameParty.increaseSteps();
    check('never offered again once joined', IsaacMod.canEncounter() === false);
    const isaac = $gameActors.actor(ids.actor);
    check('Isaac knows his skills', [ids.skillTears, ids.skillBrimstone, ids.skillYumHeart, ids.skillD6].every((s) => isaac.isLearnedSkill(s)));
    check('skill menu shows Basement', isaac.addedSkillTypes().indexOf(ids.stype) >= 0);
    check('stats applied', isaac.mhp === 70 && isaac.hp === 70 && isaac.mmp === 12, [isaac.mhp, isaac.mmp]);
    check('can actually hit things', isaac.hit > 0.9, isaac.hit);
    check('slippery', Math.abs(isaac.eva - 0.15) < 1e-9, isaac.eva);
    check('walk sprite', isaac.characterName() === '$Isaac' && $gamePlayer.followers().follower(1).characterName() === '$Isaac');
  });

  section('encounter: abandon', () => {
    IsaacMod.leave();
    IsaacMod.reset();
    for (let i = 0; i < 60; i++) $gameParty.increaseSteps();
    IsaacMod.updateEncounter();
    runInterpreter(2);
    check('abandoned', IsaacMod.state().refused === true && !IsaacMod.isInParty());
    for (let i = 0; i < 1000; i++) $gameParty.increaseSteps();
    check('never again', IsaacMod.canEncounter() === false);
  });

  section('plugin commands', () => {
    const it = new Game_Interpreter();
    it.pluginCommand('IsaacMod', ['join']);
    check('join command', IsaacMod.isInParty());
    it.pluginCommand('IsaacMod', ['leave']);
    check('leave command', !IsaacMod.isInParty());
    const before = $gameParty.numItems($dataItems[ids.itemPill]);
    it.pluginCommand('isaacmod', ['ITEMS']);
    check('items command (case-insensitive)', $gameParty.numItems($dataItems[ids.itemPill]) === before + 2);
    it.pluginCommand('IsaacMod', ['encounter']);
    check('encounter command queues the scene', $gameTemp._commonEventId === ids.ceEncounter);
    $gameTemp.clearCommonEvent();
    it.pluginCommand('IsaacMod', ['join']);
  });

  section('message layout', () => {
    const list = $dataCommonEvents[ids.ceEncounter].list;
    let face = false;
    list.forEach((c) => {
      if (c.code === 101) face = !!c.parameters[0];
      if (c.code === 401) {
        const max = face ? 42 : 54;
        check('line fits (' + visibleLength(c.parameters[0]) + '/' + max + '): ' + c.parameters[0], visibleLength(c.parameters[0]) <= max);
      }
      if (c.code === 102) check('choices short', c.parameters[0].every((s) => s.length <= 20));
    });
    let open = 0;
    list.forEach((c) => { if (c.code === 102) open++; if (c.code === 404) open--; });
    check('choice blocks balanced', open === 0);
    check('event ends with terminator', list[list.length - 1].code === 0 && list[list.length - 1].indent === 0);
  });

  // ------------------------------------------------------------------ battle
  const isaac = $gameActors.actor(ids.actor);
  const cahara = $gameActors.actor(1);
  const log = logRecorder();
  $gameTroop.setup(1);
  $gameParty.onBattleStart();
  $gameTroop.onBattleStart();
  BattleManager._logWindow = log;
  const realRandom = Math.random;
  const fixRandom = (v) => { Math.random = () => v; };

  section('tears', () => {
    check('in battle', $gameParty.inBattle());
    check('unarmed attack is Tears', isaac.attackSkillId() === ids.skillTears);
    check('Cahara still attacks normally', cahara.attackSkillId() === 1);
    $gameParty.gainItem($dataWeapons[1], 1);
    isaac.changeEquip(0, $dataWeapons[1]);
    check('can equip a longsword', isaac.weapons().length === 1);
    check('armed attack is the weapon', isaac.attackSkillId() === 1);
    isaac.changeEquip(0, null);
    $gameParty.loseItem($dataWeapons[1], 1);
    fixRandom(0.5);
    const a = new Game_Action(isaac);
    a.setAttack();
    a.setTarget(0);
    check('Tears is the attack', a.item() === $dataSkills[ids.skillTears] && a.isAttack());
    const targets = a.makeTargets();
    check('two tears', targets.length === 2 && targets[0] === targets[1]);
    a.setTarget(1);
    const torso = $gameTroop.members()[1];
    const hp0 = torso.hp;
    a.makeTargets().forEach((t) => a.apply(t));
    check('tears hurt (' + (hp0 - torso.hp) + ' from 2 tears)', torso.hp < hp0 && torso.hp > 0, [hp0, torso.hp]);
    torso.setHp(torso.mhp);
  });

  section('brimstone', () => {
    fixRandom(0.5);
    const a = new Game_Action(isaac);
    a.setSkill(ids.skillBrimstone);
    check('affordable at full MP', isaac.canUse($dataSkills[ids.skillBrimstone]), [isaac.mp, $dataSkills[ids.skillBrimstone].mpCost]);
    const targets = a.makeTargets();
    check('hits every body part', targets.length === 3);
    const before = targets.map((t) => t.hp);
    targets.forEach((t) => a.apply(t));
    check('every part damaged', targets.every((t, i) => t.hp < before[i]), targets.map((t) => t.hp));
    $gameTroop.members().forEach((e) => { e.recoverAll(); });
  });

  section('yum heart', () => {
    fixRandom(0.5);
    cahara.setHp(20);
    const a = new Game_Action(isaac);
    a.setSkill(ids.skillYumHeart);
    a.setTarget(0);
    a.apply(cahara);
    check('heals ~40% max HP', cahara.hp >= 20 + 31 && cahara.hp <= 20 + 37, cahara.hp);
    cahara.recoverAll();
  });

  section('d6', () => {
    const expect = {
      1: () => isaac.hp === 70 - 18,
      2: () => isaac.hp === 70,
      3: (c) => $gameParty.numItems($dataItems[ids.itemPill]) === c.pills + 1,
      4: () => cahara.hp === 30 + 22 && isaac.hp === 50 + 18,
      5: (c) => $gameParty.numItems($dataItems[ids.itemBomb]) === c.bombs + 1,
      6: () => cahara.hp === 30 + 51 && isaac.hp === isaac.mhp,
    };
    for (let n = 1; n <= 6; n++) {
      isaac.recoverAll();
      cahara.recoverAll();
      if (n === 4 || n === 6) { isaac.setHp(50); cahara.setHp(30); }
      const counts = { pills: $gameParty.numItems($dataItems[ids.itemPill]), bombs: $gameParty.numItems($dataItems[ids.itemBomb]) };
      log.lines.length = 0;
      while (isaac.isAnimationRequested()) isaac.shiftAnimation();
      fixRandom((n - 0.5) / 6);
      const a = new Game_Action(isaac);
      a.setSkill(ids.skillD6);
      const targets = a.makeTargets();
      check('D6 targets Isaac', targets.length === 1 && targets[0] === isaac);
      a.apply(isaac);
      check('rolled ' + n, IsaacMod.lastRoll === n, IsaacMod.lastRoll);
      check('roll ' + n + ' effect', expect[n](counts), { isaac: isaac.hp, cahara: cahara.hp });
      check('roll ' + n + ' logged', log.lines.length === 1 && log.lines[0].indexOf(String(n)) === 0, log.lines);
      check('roll ' + n + ' never says "no effect"', isaac.result().success === true);
      const anim = isaac.isAnimationRequested() ? isaac.shiftAnimation().animationId : 0;
      check('roll ' + n + ' shows its die face', anim === ids.animD6[n], anim);
    }
    isaac.setHp(1);
    fixRandom(0.5 / 6);
    const a = new Game_Action(isaac);
    a.setSkill(ids.skillD6);
    a.apply(isaac);
    check('a cursed roll cannot kill', isaac.hp === 1 && isaac.isAlive());
    isaac.recoverAll();
    cahara.recoverAll();
  });

  section('pills in battle', () => {
    IsaacMod.PILLS.forEach((pill, i) => {
      isaac.clearBuffs();
      isaac.clearParamPlus();
      isaac.recoverAll();
      isaac.setHp(40);
      isaac.setMp(2);
      const mhp = isaac.mhp;
      log.lines.length = 0;
      fixRandom((i + 0.5) / IsaacMod.PILLS.length);
      const a = new Game_Action(cahara);
      a.setItem(ids.itemPill);
      check(pill.name + ': usable on Isaac', a.testApply(isaac));
      a.apply(isaac);
      check(pill.name + ': picked', IsaacMod.lastPill === pill.name, IsaacMod.lastPill);
      check(pill.name + ': logged', log.lines.length === 1 && log.lines[0].indexOf(pill.name) > 0, log.lines);
      const fx = {
        'Full Health': () => isaac.hp === isaac.mhp,
        'Health Up': () => isaac.mhp === mhp + 4 && isaac.hp === 44,
        'Bad Trip': () => isaac.hp === 40 - 14,
        'Balls of Steel': () => isaac.isBuffAffected(3) && isaac.isBuffAffected(5),
        'Speed Up': () => isaac.isBuffAffected(6),
        'Tears Up': () => isaac.isBuffAffected(2) && isaac.isBuffAffected(4),
        Hematemesis: () => isaac.hp === Math.ceil(isaac.mhp * 0.15) && isaac.mp === isaac.mmp,
        'I Can See Forever!': () => isaac.mp === 2 + Math.ceil(isaac.mmp * 0.5),
        'Bad Gas': () => isaac.hp === 40,
        Amnesia: () => isaac.hp === 40,
      }[pill.name];
      check(pill.name + ': effect', fx && fx(), { hp: isaac.hp, mhp: isaac.mhp, mp: isaac.mp });
    });
    isaac.clearParamPlus();
    isaac.clearBuffs();
    isaac.recoverAll();
    const a = new Game_Action(cahara);
    a.setItem(ids.itemPill);
    isaac.addState(1);
    check('pills do not work on the dead', a.testApply(isaac) === false);
    isaac.removeState(1);
    isaac.recoverAll();
  });

  section('bomb', () => {
    fixRandom(0.5);
    const torso = $gameTroop.members()[1];
    const hits = [isaac, cahara].map((user) => {
      torso.recoverAll();
      const a = new Game_Action(user);
      a.setItem(ids.itemBomb);
      const targets = a.makeTargets();
      check('bomb hits every part', targets.length === 3);
      a.apply(torso);
      return torso.mhp - torso.hp;
    });
    check('bomb damage (' + hits[0] + ') does not depend on the thrower', hits[0] > 0 && hits[0] === hits[1], hits);
    $gameTroop.members().forEach((e) => e.recoverAll());
  });

  section('portrait and voice', () => {
    isaac.recoverAll();
    check('healthy face', isaac.faceIndex() === IsaacMod.FACES.crying);
    isaac.setHp(Math.floor(isaac.mhp * 0.5));
    check('hurt face', isaac.faceIndex() === IsaacMod.FACES.hurt);
    isaac.setHp(Math.floor(isaac.mhp * 0.2));
    check('wounded face', isaac.faceIndex() === IsaacMod.FACES.wounded);
    isaac.addState(1);
    check('dead face', isaac.faceIndex() === IsaacMod.FACES.dead);
    isaac.removeState(1);
    isaac.recoverAll();
    isaac.setFaceImage('SomethingElse', 3);
    check('custom face left alone', isaac.faceIndex() === 3);
    isaac.setFaceImage('Isaac', 0);
    check('other actors untouched', cahara.faceIndex() === 0);
    AudioManager._played = [];
    isaac.performDamage();
    check('Isaac whimpers when hit', AudioManager._played.indexOf('Isaac_Hurt') >= 0);
    AudioManager._played = [];
    cahara.performDamage();
    check('others do not', AudioManager._played.indexOf('Isaac_Hurt') < 0);
  });

  Math.random = realRandom;
  $gameParty.onBattleEnd();
  $gameTroop.onBattleEnd && $gameTroop.onBattleEnd();
  BattleManager._logWindow = null;

  section('pill from the menu', () => {
    check('out of battle', !$gameParty.inBattle());
    isaac.setHp(30);
    fixRandom(0.5 / IsaacMod.PILLS.length);  // Full Health
    const a = new Game_Action(cahara);
    a.setItemObject($dataItems[ids.itemPill]);
    check('menu allows it', a.testApply(isaac));
    a.apply(isaac);
    Math.random = realRandom;
    check('healed', isaac.hp === isaac.mhp);
    check('message queued for the map', $gameTemp._commonEventId === ids.ceMessage, $gameTemp._commonEventId);
    const shown = runInterpreter(0);
    check('message shown on the map', shown.length === 1 && shown[0].text[0] === 'Isaac swallows the pill... Full Health!', shown);
    const y = new Game_Action(isaac);
    y.setSkill(ids.skillYumHeart);
    cahara.setHp(10);
    check('yum heart usable outside battle', isaac.canUse($dataSkills[ids.skillYumHeart]) && y.testApply(cahara));
    const d = $dataSkills[ids.skillD6];
    check('D6 is battle-only', !isaac.canUse(d));
    cahara.recoverAll();
  });

  section('icons', () => {
    const calls = [];
    const win = { contents: { blt: function () { calls.push(Array.prototype.slice.call(arguments)); } } };
    Window_Base.prototype.drawIcon.call(win, $dataItems[ids.itemPill].iconIndex, 10, 20);
    check('mod icon drawn from IsaacIcons', calls[0][0].name === 'IsaacIcons' && calls[0][1] === 128 && calls[0][2] === 0 && calls[0][5] === 10, calls[0]);
    Window_Base.prototype.drawIcon.call(win, 76, 0, 0);
    check('game icons still from IconSet', calls[1][0].name === 'IconSet' && calls[1][1] === 12 * 32 && calls[1][2] === 4 * 32, calls[1]);
  });

  section('save and load', () => {
    const json = JsonEx.stringify(DataManager.makeSaveContents());
    DataManager.createGameObjects();
    check('fresh state is empty', !IsaacMod.isInParty());
    DataManager.extractSaveContents(JsonEx.parse(json));
    check('Isaac survives a save', IsaacMod.isInParty() && $gameActors.actor(ids.actor).name() === 'Isaac');
    check('encounter state survives a save', IsaacMod.state().joined === true);
  });

  finish(scenario);
}

if (scenario === 'hunger') {
  const gabs = [];
  boot({
    fh: true,
    before() {
      // Stand-ins for YEP_GabWindow and YEP_BaseParamControl.
      global.Imported = global.Imported || {};
      Imported.YEP_GabWindow = true;
      const _pc = Game_Interpreter.prototype.pluginCommand;
      Game_Interpreter.prototype.pluginCommand = function (command, args) {
        _pc.call(this, command, args);
        if (command === 'GabText') this._gab = args.join(' ');
        if (command === 'ShowGab') gabs.push(this._gab);
      };
      Game_BattlerBase.prototype.setMaxHp = function (v) {
        this._paramPlus[0] = 0;
        this._paramPlus[0] = v - this.param(0);
        this.refresh();
      };
    },
  });
  const fh = global.__fh;
  const ids = IsaacMod.ids;
  const S = (n) => $dataSystem.switches.indexOf(n);
  section('detection', () => {
    check('mod ready', IsaacMod._ready, String(IsaacMod._error));
    const F = IsaacMod.fh;
    check('hunger hooked up', F.hunger === true);
    check('switches found', F.startSwitch === 10 && F.busySwitch === 11 && F.noDecreaseSwitch === 12, F);
    check('PartySize found', F.partySizeVar === 5);
    check('deathCheck found', F.deathCheck === true);
    check('Party_Check patched', F.partyCheck === true);
    const list = $dataCommonEvents[fh.partyCheck].list;
    check('Party_Check counts Isaac', list.some((c) => c.code === 111 && c.parameters[0] === 4 && c.parameters[1] === ids.actor));
    check('Party_Check still ends properly', list[list.length - 1].code === 0 && list[list.length - 2].code === 412);
    check('same EXP curve as the cast', JSON.stringify($dataClasses[ids.classId].expParams) === '[19,38,50,10]');
  });

  startGame();
  const isaac = $gameActors.actor(ids.actor);
  const tick = (n) => { for (let i = 0; i < n; i++) IsaacMod.updateCompanion(); };
  const lastGab = () => (IsaacMod._gabs || []).slice(-1)[0] || gabs.slice(-1)[0] || '';

  section('waits for the intro', () => {
    for (let i = 0; i < 100; i++) $gameParty.increaseSteps();
    check('no encounter before START', IsaacMod.canEncounter() === false);
    $gameSwitches.setValue(S('START'), true);
    check('encounter after START', IsaacMod.canEncounter() === true);
  });

  section('joins with a full stomach', () => {
    IsaacMod.join();
    check('level 2 like everyone', isaac.level === 2, isaac.level);
    check('EXP 156 (= full)', isaac.currentExp() === 156, isaac.currentExp());
    check('no hunger states', fh && Object.keys(fh.states).filter((n) => /Hunger/.test(n)).every((n) => !isaac.isStateAffected(fh.states[n])));
    check('full body', isaac.mhp === 70 && isaac.hp === 70, [isaac.mhp, isaac.hp]);
    $gameTemp.reserveCommonEvent(fh.partyCheck);
    runInterpreter(0);
    check('PartySize counts Isaac', $gameVariables.value(5) === 2, $gameVariables.value(5));
  });

  section('gets hungry', () => {
    tick(799);
    check('nothing for 799 frames', isaac.currentExp() === 156);
    tick(1);
    check('one point every 800 frames', isaac.currentExp() === 155);
    $gameSwitches.setValue(S('//NO_DECREASING//'), true);
    tick(800);
    check('NO_DECREASING stops it', isaac.currentExp() === 155);
    $gameSwitches.setValue(S('//NO_DECREASING//'), false);
    $gameSwitches.setValue(S('START'), false);
    tick(1600);
    check('paused before START', isaac.currentExp() === 155);
    $gameSwitches.setValue(S('START'), true);
    isaac.addState(fh.states.Parasites);
    IsaacMod.state().hungerClock = 0;
    tick(400);
    check('parasites double it', isaac.currentExp() === 154);
    isaac.removeState(fh.states.Parasites);
    $gameParty.onBattleStart();
    tick(1600);
    check('not during battle', isaac.currentExp() === 154);
    $gameParty.onBattleEnd();
    isaac.recoverAll();
  });

  section('hunger levels', () => {
    isaac.changeExp(129, false);
    IsaacMod.state().hungerClock = 0;
    tick(800);
    check('warned at 128', lastGab() === '\\N[' + ids.actor + '] is starting to feel hungry...', lastGab());
    isaac.changeExp(109, false);
    tick(800);
    check('weak at 108', lastGab().indexOf('weak from hunger') > 0 && isaac.isStateAffected(fh.states['Hunger LVL 1']));
    check('body shrinks to 90%', isaac.mhp === 63, isaac.mhp);
    isaac.changeExp(64, false);
    tick(800);
    check('blind at 63', isaac.isStateAffected(fh.states['Hunger LVL 5']) && !isaac.isStateAffected(fh.states['Hunger LVL 1']));
    check('body at 30%', isaac.mhp === 21, isaac.mhp);
  });

  section('eats', () => {
    isaac.changeExp(108, false);
    isaac.addState(fh.states['Food small']);
    check('small food +7', isaac.currentExp() === 115, isaac.currentExp());
    check('food state consumed', !isaac.isStateAffected(fh.states['Food small']));
    check('hunger states cleared', !isaac.isStateAffected(fh.states['Hunger LVL 5']) && !isaac.isStateAffected(fh.states['Hunger LVL 1']));
    check('body restored', isaac.mhp === 70, isaac.mhp);
    check('says so', lastGab().indexOf('feels a little less hungry') > 0, lastGab());
    isaac.changeExp(150, false);
    isaac.addState(fh.states['Food medium']);
    check('never overfull', isaac.currentExp() === 156, isaac.currentExp());
    isaac.changeExp(120, false);
    const a = new Game_Action($gameActors.actor(1));
    a.setItemObject($dataItems[fh.egg]);
    check('egg usable on Isaac', a.testApply(isaac));
    a.apply(isaac);
    check('eating an egg from the menu feeds him', isaac.currentExp() === 127, isaac.currentExp());
    IsaacMod.state().bodyBonus = 0;
  });

  section('gab messages reach YEP_GabWindow', () => {
    const queued = IsaacMod._gabs.slice();
    gabs.length = 0;
    SceneManager._scene = {};
    IsaacMod.flushGabs();
    check('held back until the map has a gab window', gabs.length === 0 && IsaacMod._gabs.length === queued.length);
    SceneManager._scene = { _gabWindow: {} };
    IsaacMod.flushGabs();
    check('all queued gabs shown in order', JSON.stringify(gabs) === JSON.stringify(queued), gabs);
    check('queue emptied', IsaacMod._gabs.length === 0);
    SceneManager._scene = null;
  });

  section('starves', () => {
    isaac.changeExp(58, false);
    IsaacMod.state().hungerClock = 0;
    tick(800);
    check('dies at 57', isaac.isDead() && !IsaacMod.isInParty());
    check('dizzy message', lastGab().indexOf('feels dizzy') > 0);
    check('remembered as starved', IsaacMod.state().lost === 'starved');
    for (let i = 0; i < 500; i++) $gameParty.increaseSteps();
    check('no second encounter', IsaacMod.canEncounter() === false);
  });

  section('fallen companions stay dead', () => {
    isaac.removeState(1);
    isaac.recoverAll();
    isaac.changeExp(150, false);
    IsaacMod.join();
    check('back for the test', IsaacMod.isInParty() && isaac.currentExp() === 150);
    isaac.clearResult();
    isaac.addState(1);
    check('knocked out', isaac.isDead());
    $gameParty.onBattleStart();
    IsaacMod.updateCompanion();
    check('kept during battle', IsaacMod.isInParty());
    $gameParty.onBattleEnd();
    IsaacMod.updateCompanion();
    check('removed on the map like deathCheck does', !IsaacMod.isInParty() && IsaacMod.state().lost === 'dead');
  });
  finish(scenario);
}

if (scenario === 'late') {
  // A plugin that bypasses DataManager.onLoad: Isaac is injected at
  // Scene_Boot.start and must pick up the decorations other plugins added.
  boot({ skipOnLoad: true, stubBootStart: true });
  section('late injection', () => {
    check('not injected yet', !IsaacMod._injected);
    DataManager.isDatabaseLoaded();
    Scene_Boot.prototype.start.call({});
    check('injected at boot start', IsaacMod._ready === true, String(IsaacMod._error));
    const sk = $dataSkills[IsaacMod.ids.skillBrimstone];
    check('adopted plugin fields', Array.isArray(sk.setupActions) && sk.fakeProcessed === true, Object.keys(sk));
    check('kept its own fields', sk.name === 'Brimstone' && sk.scope === 2);
    check('meta present', !!sk.meta);
  });
  finish(scenario);
}

if (scenario === 'order') {
  // Database files can arrive in any order.
  const results = [];
  for (let seed = 1; seed <= 6; seed++) {
    const r = spawnSync(process.execPath, [__filename, 'order-one', String(seed)], { encoding: 'utf8', env: process.env });
    results.push(r.stdout.trim());
  }
  results.forEach((out, i) => check('load order #' + (i + 1) + ' → ' + out, out === 'ok 7 1'));
  finish(scenario);
}

if (scenario === 'order-one') {
  boot({ order: Number(process.argv[3]) });
  DataManager.isDatabaseLoaded();
  process.stdout.write(IsaacMod._ready && $dataSkills[IsaacMod.ids.skillTears].fakeProcessed ? 'ok ' + IsaacMod.ids.actor + ' ' + IsaacMod.ids.stype : 'bad ' + IsaacMod._error);
  process.exit(0);
}
