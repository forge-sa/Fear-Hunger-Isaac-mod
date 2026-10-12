'use strict';
// Loads the open-source RPG Maker MV engine (rpgtkoolmv/corescript) into the
// Node global scope with just enough browser stubs to run game logic
// (database, interpreter, battle actions). Nothing is rendered.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const CORE_DIR = process.env.MV_CORESCRIPT || path.join(__dirname, '.corescript');

function ensureCorescript() {
  if (fs.existsSync(path.join(CORE_DIR, 'rpg_objects.json'))) return;
  console.log('Fetching rpgtkoolmv/corescript into ' + CORE_DIR + ' ...');
  execFileSync('git', ['clone', '--depth', '1', '-q', 'https://github.com/rpgtkoolmv/corescript.git', CORE_DIR], { stdio: 'inherit' });
}

// Any property is a constructor with a prototype; enough for
// "Object.create(PIXI.Sprite.prototype)"-style class definitions.
function stub(name) {
  const fn = function () {};
  return new Proxy(fn, {
    get(target, key) {
      if (key in target) return target[key];
      if (typeof key === 'symbol') return undefined;
      target[key] = stub(name + '.' + String(key));
      return target[key];
    },
  });
}

function installBrowserStubs() {
  global.window = global;
  global.PIXI = stub('PIXI');
  Object.defineProperty(global, 'navigator', { value: { userAgent: 'node', platform: 'node' }, configurable: true, writable: true });
  const el = () => ({
    style: {}, appendChild() {}, addEventListener() {}, getContext: () => null, setAttribute() {},
  });
  global.document = {
    createElement: el, getElementById: () => null, addEventListener() {}, body: el(),
    getElementsByTagName: () => [], querySelector: () => null,
  };
  global.location = { search: '', href: 'http://localhost/index.html' };
  global.requestAnimationFrame = () => 0;
  global.Image = function () { this.addEventListener = () => {}; };
  global.XMLHttpRequest = function () {
    this.open = (method, url) => { this.url = url; XMLHttpRequest.requests.push(this); };
    this.send = () => {};
    this.overrideMimeType = () => {};
  };
  global.XMLHttpRequest.requests = [];
  global.FontFace = undefined;
}

function load(files) {
  for (const f of files) {
    const code = fs.readFileSync(path.join(CORE_DIR, f), 'utf8');
    vm.runInThisContext(code, { filename: f });
  }
}

function bootEngine() {
  ensureCorescript();
  installBrowserStubs();
  for (const group of ['rpg_core', 'rpg_managers', 'rpg_objects', 'rpg_scenes', 'rpg_sprites', 'rpg_windows']) {
    load(JSON.parse(fs.readFileSync(path.join(CORE_DIR, group + '.json'), 'utf8')));
  }
  // Keep audio/image managers inert.
  AudioManager.playSe = function (se) { (AudioManager._played = AudioManager._played || []).push(se.name); };
  AudioManager.playStaticSe = function () {};
  SoundManager.playActorDamage = function () {};
}

function loadPlugin(file, params) {
  PluginManager._parameters = PluginManager._parameters || {};
  PluginManager._parameters[path.basename(file, '.js').toLowerCase()] = params || {};
  vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: path.basename(file) });
}

module.exports = { bootEngine, loadPlugin, ensureCorescript, CORE_DIR };
