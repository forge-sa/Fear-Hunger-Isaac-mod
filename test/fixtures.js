'use strict';
// A small database shaped like Fear & Hunger's: four leads plus a companion,
// enemies split into body parts, encrypted assets, front-view battles.

function row(v) {
  return new Array(100).fill(v);
}

function cls(id, name, p) {
  return {
    id, name, note: '', expParams: [30, 20, 30, 30],
    params: p.map(row),
    learnings: [],
    traits: [
      { code: 23, dataId: 0, value: 1 },
      { code: 22, dataId: 0, value: 0.95 },
      { code: 22, dataId: 1, value: 0.05 },
      { code: 22, dataId: 2, value: 0.04 },
      { code: 41, dataId: 1, value: 1 },
      { code: 51, dataId: 1, value: 0 },
      { code: 52, dataId: 1, value: 0 },
    ],
  };
}

function actor(id, name, classId) {
  return {
    id, name, nickname: '', classId, initialLevel: 1, maxLevel: 99, characterName: 'Actor1',
    characterIndex: 0, faceName: 'Actor1', faceIndex: 0, battlerName: '', equips: [0, 0, 0, 0, 0],
    traits: [], note: '', profile: '',
  };
}

function enemy(id, name, hp, def) {
  return {
    id, name, battlerName: name, battlerHue: 0, exp: 0, gold: 0, note: '',
    params: [hp, 0, 14, def, 10, 8, 10, 10],
    traits: [
      { code: 22, dataId: 0, value: 0.95 },
      { code: 22, dataId: 1, value: 0.05 },
      { code: 31, dataId: 1, value: 0 },
    ],
    actions: [{ skillId: 1, rating: 5, conditionType: 0, conditionParam1: 0, conditionParam2: 0 }],
    dropItems: [{ kind: 0, dataId: 1, denominator: 1 }, { kind: 0, dataId: 1, denominator: 1 }, { kind: 0, dataId: 1, denominator: 1 }],
  };
}

function state(id, name, extra) {
  return Object.assign({
    id, name, iconIndex: 0, message1: '', message2: '', message3: '', message4: '', motion: 0, overlay: 0,
    note: '', priority: 50, restriction: 0, autoRemovalTiming: 0, chanceByDamage: 100, maxTurns: 1, minTurns: 1,
    releaseByDamage: false, removeAtBattleEnd: false, removeByDamage: false, removeByRestriction: false,
    removeByWalking: false, stepsToRemove: 100, traits: [],
  }, extra || {});
}

function se(name) {
  return { name, pan: 0, pitch: 100, volume: 90 };
}

function makeDatabase() {
  const sounds = [];
  for (let i = 0; i < 24; i++) sounds.push(se('Cursor1'));
  const vehicle = { bgm: { name: '', pan: 0, pitch: 100, volume: 90 }, characterIndex: 0, characterName: '', startMapId: 0, startX: 0, startY: 0 };
  return {
    $dataActors: [null,
      actor(1, 'Mercenary Cahara', 1), actor(2, 'Knight D\'arce', 2), actor(3, 'Dark Priest Enki', 3),
      actor(4, 'Outlander Ragnvaldr', 4), actor(5, 'Le\'garde', 5),
      { id: 6, name: '', nickname: '', classId: 1, initialLevel: 1, maxLevel: 99, characterName: '', characterIndex: 0, faceName: '', faceIndex: 0, battlerName: '', equips: [], traits: [], note: '', profile: '' }],
    $dataClasses: [null,
      cls(1, 'Mercenary', [85, 20, 12, 8, 6, 6, 14, 12]),
      cls(2, 'Knight', [120, 10, 15, 14, 4, 8, 8, 8]),
      cls(3, 'Dark Priest', [70, 45, 7, 6, 16, 14, 10, 10]),
      cls(4, 'Outlander', [130, 10, 18, 10, 4, 6, 10, 8]),
      cls(5, 'Soldier', [100, 10, 14, 12, 4, 8, 9, 10])],
    $dataSkills: [null,
      { id: 1, name: 'Attack', animationId: -1, damage: { critical: true, elementId: -1, formula: 'a.atk * 4 - b.def * 2', type: 1, variance: 20 },
        description: '', effects: [{ code: 21, dataId: 0, value1: 1, value2: 0 }], hitType: 1, iconIndex: 76, message1: ' attacks!', message2: '',
        mpCost: 0, note: '<Fake Notetag: 3>', occasion: 1, repeats: 1, requiredWtypeId1: 0, requiredWtypeId2: 0, scope: 1, speed: 0, stypeId: 0,
        successRate: 100, tpCost: 0, tpGain: 0 },
      { id: 2, name: 'Guard', animationId: 0, damage: { critical: false, elementId: 0, formula: '0', type: 0, variance: 20 },
        description: '', effects: [{ code: 21, dataId: 2, value1: 1, value2: 0 }], hitType: 0, iconIndex: 81, message1: ' guards.', message2: '',
        mpCost: 0, note: '', occasion: 1, repeats: 1, requiredWtypeId1: 0, requiredWtypeId2: 0, scope: 11, speed: 2000, stypeId: 0,
        successRate: 100, tpCost: 0, tpGain: 0 }],
    $dataItems: [null,
      { id: 1, name: 'Blue Herb', animationId: 0, consumable: true, damage: { critical: false, elementId: 0, formula: '0', type: 0, variance: 20 },
        description: '', effects: [{ code: 11, dataId: 0, value1: 0, value2: 30 }], hitType: 0, iconIndex: 176, itypeId: 1, note: '',
        occasion: 0, price: 10, repeats: 1, scope: 7, speed: 0, successRate: 100, tpGain: 0 }],
    $dataWeapons: [null,
      { id: 1, name: 'Longsword', animationId: 1, description: '', etypeId: 1, iconIndex: 97, note: '', params: [0, 0, 20, 0, 0, 0, 0, 0], price: 0, traits: [{ code: 31, dataId: 1, value: 0 }], wtypeId: 1 },
      { id: 2, name: 'Rusty dagger', animationId: 1, description: '', etypeId: 1, iconIndex: 96, note: '', params: [0, 0, 8, 0, 0, 0, 0, 0], price: 0, traits: [], wtypeId: 2 }],
    $dataArmors: [null,
      { id: 1, name: 'Leather armor', atypeId: 1, description: '', etypeId: 4, iconIndex: 135, note: '', params: [0, 0, 0, 6, 0, 0, 0, 0], price: 0, traits: [] }],
    $dataEnemies: [null, enemy(1, 'Guard head', 40, 6), enemy(2, 'Guard torso', 90, 10), enemy(3, 'Guard arm', 30, 8)],
    $dataTroops: [null, { id: 1, name: 'Guard', members: [
      { enemyId: 1, x: 400, y: 150, hidden: false }, { enemyId: 2, x: 400, y: 280, hidden: false }, { enemyId: 3, x: 300, y: 260, hidden: false }],
    pages: [{ conditions: { actorHp: 50, actorId: 1, actorValid: false, enemyHp: 50, enemyIndex: 0, enemyValid: false, switchId: 1, switchValid: false, turnA: 0, turnB: 0, turnEnding: false, turnValid: false }, list: [{ code: 0, indent: 0, parameters: [] }], span: 0 }] }],
    $dataStates: [null,
      state(1, 'Dead', { restriction: 4, priority: 100, motion: 3 }),
      state(2, 'Guard', { traits: [{ code: 62, dataId: 1, value: 0 }], autoRemovalTiming: 2, removeAtBattleEnd: true })],
    $dataAnimations: [null, { id: 1, name: 'Hit', animation1Hue: 0, animation1Name: 'Hit1', animation2Hue: 0, animation2Name: '', frames: [[[0, 0, 0, 100, 0, 0, 255, 1]]], position: 1, timings: [] }],
    $dataTilesets: [null, { id: 1, name: 'Dungeon', mode: 1, note: '', flags: new Array(8192).fill(0), tilesetNames: ['', '', '', '', '', '', '', '', ''] }],
    $dataCommonEvents: [null, { id: 1, name: 'Hunger tick', list: [{ code: 0, indent: 0, parameters: [] }], switchId: 1, trigger: 0 }],
    $dataSystem: {
      gameTitle: 'Fear & Hunger (fixture)', versionId: 1, locale: 'en_US', currencyUnit: 'G', partyMembers: [1],
      startMapId: 1, startX: 5, startY: 5, optSideView: false, optDisplayTp: false, optDrawTitle: true, optExtraExp: false,
      optFloorDeath: false, optFollowers: true, optSlipDeath: false, optTransparent: false,
      hasEncryptedImages: true, hasEncryptedAudio: true, encryptionKey: '0123456789abcdef0123456789abcdef',
      skillTypes: ['', 'Skills', 'Magic'], weaponTypes: ['', 'Sword', 'Dagger'], armorTypes: ['', 'Light armor', 'Heavy armor'],
      equipTypes: ['', 'Weapon', 'Shield', 'Head', 'Body', 'Accessory'], elements: ['', 'Physical', 'Fire'],
      switches: new Array(21).fill(''), variables: new Array(21).fill(''),
      magicSkills: [2], attackMotions: [], airship: vehicle, boat: vehicle, ship: vehicle,
      battleBgm: { name: '', pan: 0, pitch: 100, volume: 90 }, defeatMe: { name: '', pan: 0, pitch: 100, volume: 90 },
      victoryMe: { name: '', pan: 0, pitch: 100, volume: 90 }, gameoverMe: { name: '', pan: 0, pitch: 100, volume: 90 },
      titleBgm: { name: '', pan: 0, pitch: 100, volume: 90 }, sounds,
      terms: {
        basic: ['Level', 'Lv', 'HP', 'HP', 'MP', 'MP', 'TP', 'TP', 'EXP', 'EXP'],
        commands: ['Fight', 'Escape', 'Attack', 'Guard', 'Item', 'Skill', 'Equip', 'Status', 'Formation', 'Save', 'Game End', 'Options', 'Weapon', 'Armor', 'Key Item', 'Equip', 'Optimize', 'Clear', 'New Game', 'Continue', null, 'To Title', 'Cancel', null, 'Buy', 'Sell'],
        params: ['Max HP', 'Max MP', 'Attack', 'Defense', 'M.Attack', 'M.Defense', 'Agility', 'Luck', 'Hit', 'Evasion'],
        messages: {
          actionFailure: 'There was no effect on %1!', actorDamage: '%1 took %2 damage!', actorRecovery: '%1 recovered %2 %3!',
          actorGain: '%1 gained %2 %3!', actorLoss: '%1 lost %2 %3!', actorDrain: '%1 was drained of %2 %3!', actorNoDamage: '%1 took no damage!',
          actorNoHit: 'Miss! %1 took no damage!', enemyDamage: '%1 took %2 damage!', enemyRecovery: '%1 recovered %2 %3!',
          enemyGain: '%1 gained %2 %3!', enemyLoss: '%1 lost %2 %3!', enemyDrain: 'Drained %2 %3 from %1!', enemyNoDamage: '%1 took no damage!',
          enemyNoHit: 'Miss! %1 took no damage!', evasion: '%1 evaded the attack!', magicEvasion: '%1 nullified the magic!',
          magicReflection: '%1 reflected the magic!', counterAttack: '%1 counterattacked!', substitute: '%1 protected %2!',
          buffAdd: '%1\'s %2 went up!', debuffAdd: '%1\'s %2 went down!', buffRemove: '%1\'s %2 returned to normal!',
          useItem: '%1 uses %2!', criticalToEnemy: 'An excellent hit!!', criticalToActor: 'A painful blow!!',
          partyName: '%1\'s Party', emerge: '%1 emerged!', preemptive: '%1 got the upper hand!', surprise: '%1 was surprised!',
          escapeStart: '%1 has started to escape!', escapeFailure: 'However, it was unable to escape!', victory: '%1 was victorious!',
          defeat: '%1 was defeated.', obtainExp: '%1 %2 received!', obtainGold: '%1\\G found!', obtainItem: '%1 found!',
          levelUp: '%1 is now %2 %3!', obtainSkill: '%1 learned!', file: 'File', autosave: 'Autosave', saveMessage: 'Save to which file?',
          loadMessage: 'Load which file?', alwaysDash: 'Always Dash', commandRemember: 'Command Remember', bgmVolume: 'BGM Volume',
          bgsVolume: 'BGS Volume', meVolume: 'ME Volume', seVolume: 'SE Volume', possession: 'Possession', expTotal: 'Current %1',
          expNext: 'To Next %1',
        },
      },
      testBattlers: [], testTroopId: 1, editMapId: 1, windowTone: [0, 0, 0, 0],
      battleback1Name: '', battleback2Name: '', battlerName: '', battlerHue: 0, title1Name: '', title2Name: '',
    },
    $dataMapInfos: [null, { id: 1, name: 'Prison', expanded: false, order: 1, parentId: 0, scrollX: 0, scrollY: 0 }],
  };
}

function makeMap() {
  return {
    autoplayBgm: false, autoplayBgs: false, battleback1Name: '', battleback2Name: '', bgm: se(''), bgs: se(''),
    disableDashing: false, displayName: 'Prison', encounterList: [], encounterStep: 30, height: 20, width: 20, note: '',
    parallaxLoopX: false, parallaxLoopY: false, parallaxName: '', parallaxShow: false, parallaxSx: 0, parallaxSy: 0,
    scrollType: 0, specifyBattleback: false, tilesetId: 1, data: new Array(20 * 20 * 6).fill(0), events: [null],
  };
}

// The parts of Fear & Hunger's database the mod hooks into, by the same
// names: hunger states and switches, PartySize, and the shared events.
function addFearAndHunger(db) {
  const sys = db.$dataSystem;
  sys.switches[10] = 'START';
  sys.switches[11] = 'suicide_inprocess';
  sys.switches[12] = '//NO_DECREASING//';
  sys.variables[5] = 'PartySize';
  db.$dataActors.forEach((a) => { if (a) a.initialLevel = 2; });
  db.$dataClasses.forEach((c) => { if (c) c.expParams = [19, 38, 50, 10]; });
  const names = ['Hunger LVL 1', 'Hunger LVL 2', 'Hunger LVL 3', 'Hunger LVL 4', 'Hunger LVL 5', 'Food small', 'Food medium', 'Food large', 'Parasites'];
  const ids = {};
  names.forEach((n) => {
    ids[n] = db.$dataStates.length;
    db.$dataStates.push(state(ids[n], n, /Hunger/.test(n) ? { traits: [{ code: 21, dataId: 2, value: 0.5 }] } : {}));
  });
  const ce = (name, list) => {
    const id = db.$dataCommonEvents.length;
    db.$dataCommonEvents.push({ id, name, list: list.concat([{ code: 0, indent: 0, parameters: [] }]), switchId: 1, trigger: 0 });
    return id;
  };
  const partyCheck = ce('Party_Check', [
    { code: 122, indent: 0, parameters: [5, 5, 0, 0, 0] },
    { code: 111, indent: 0, parameters: [4, 1, 0] }, { code: 122, indent: 1, parameters: [5, 5, 1, 0, 1] }, { code: 0, indent: 1, parameters: [] }, { code: 412, indent: 0, parameters: [] },
    { code: 111, indent: 0, parameters: [4, 2, 0] }, { code: 122, indent: 1, parameters: [5, 5, 1, 0, 1] }, { code: 0, indent: 1, parameters: [] }, { code: 412, indent: 0, parameters: [] },
  ]);
  ce('deathCheck', []);
  const food = ce('FOOD_small', [
    { code: 111, indent: 0, parameters: [4, 1, 6, ids['Food small']] },
    { code: 315, indent: 1, parameters: [0, 1, 0, 0, 7, false] }, { code: 313, indent: 1, parameters: [0, 1, 1, ids['Food small']] },
    { code: 0, indent: 1, parameters: [] }, { code: 412, indent: 0, parameters: [] },
  ]);
  db.$dataItems.push({ id: db.$dataItems.length, name: 'Egg', animationId: 0, consumable: true, damage: { critical: false, elementId: 0, formula: '0', type: 0, variance: 20 },
    description: '', effects: [{ code: 21, dataId: ids['Food small'], value1: 1, value2: 0 }, { code: 44, dataId: food, value1: 0, value2: 0 }], hitType: 0, iconIndex: 0, itypeId: 1, note: '',
    occasion: 0, price: 0, repeats: 1, scope: 7, speed: 0, successRate: 100, tpGain: 0 });
  return { states: ids, partyCheck, food, egg: db.$dataItems.length - 1 };
}

module.exports = { makeDatabase, makeMap, addFearAndHunger };
