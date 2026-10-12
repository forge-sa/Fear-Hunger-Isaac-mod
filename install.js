#!/usr/bin/env node
'use strict';
// Installs (or removes) the Isaac mod into Fear & Hunger.
//
//   node install.js                       auto-detect the Steam install
//   node install.js "/path/to/Fear & Hunger"
//   node install.js --uninstall [path]
//   node install.js --dry-run [path]

const fs = require('fs');
const os = require('os');
const path = require('path');

const MOD_WWW = path.join(__dirname, 'mod', 'www');
const PLUGIN_NAME = 'IsaacMod';
const GAME_DIRS = ['Fear & Hunger', 'Fear and Hunger', 'FearAndHunger'];

const args = process.argv.slice(2);
const uninstall = args.includes('--uninstall');
const dryRun = args.includes('--dry-run');
const explicit = args.find((a) => !a.startsWith('--'));

function steamRoots() {
  const home = os.homedir();
  const roots = [
    path.join(home, '.local', 'share', 'Steam'),
    path.join(home, '.steam', 'steam'),
    path.join(home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'),
    path.join(home, 'Library', 'Application Support', 'Steam'),
    'C:\\Program Files (x86)\\Steam',
    'C:\\Program Files\\Steam',
  ];
  const libs = new Set();
  for (const root of roots) {
    const vdf = path.join(root, 'steamapps', 'libraryfolders.vdf');
    if (!fs.existsSync(vdf)) continue;
    libs.add(root);
    const text = fs.readFileSync(vdf, 'utf8');
    for (const m of text.matchAll(/"path"\s+"([^"]+)"/g)) libs.add(m[1].replace(/\\\\/g, '\\'));
  }
  return Array.from(libs);
}

// Returns the folder that holds js/plugins.js (usually <game>/www).
function resolveWww(dir) {
  for (const candidate of [path.join(dir, 'www'), dir]) {
    if (fs.existsSync(path.join(candidate, 'js', 'plugins.js')) && fs.existsSync(path.join(candidate, 'data'))) {
      return candidate;
    }
  }
  return null;
}

function findGame() {
  if (explicit) {
    const www = resolveWww(path.resolve(explicit));
    if (!www) fail('No RPG Maker MV game found at "' + explicit + '" (expected www/js/plugins.js).');
    return www;
  }
  for (const lib of steamRoots()) {
    for (const name of GAME_DIRS) {
      const www = resolveWww(path.join(lib, 'steamapps', 'common', name));
      if (www) return www;
    }
  }
  fail('Could not find Fear & Hunger in your Steam libraries.\n' +
    'Pass the game folder explicitly:  node install.js "/path/to/Fear & Hunger"');
}

function fail(msg) {
  console.error('\n' + msg + '\n');
  process.exit(1);
}

function modFiles(dir = MOD_WWW, rel = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = path.join(rel, entry.name);
    if (entry.isDirectory()) out.push(...modFiles(path.join(dir, entry.name), r));
    else out.push(r);
  }
  return out;
}

const PLUGINS_RE = /^([\s\S]*?var\s+\$plugins\s*=\s*)(\[[\s\S]*\])(\s*;?\s*)$/;

function readPlugins(file) {
  const text = fs.readFileSync(file, 'utf8');
  const m = text.match(PLUGINS_RE);
  if (!m) fail('Could not understand ' + file + ' (expected "var $plugins = [...]").');
  let list;
  try {
    list = JSON.parse(m[2]);
  } catch (e) {
    fail('Could not parse the plugin list in ' + file + ': ' + e.message);
  }
  return { head: m[1], tail: m[3], list };
}

function writePlugins(file, { head, tail, list }) {
  // Same layout RPG Maker writes: one plugin per line.
  const body = '[\n' + list.map((p) => JSON.stringify(p)).join(',\n') + '\n]';
  const text = head.replace(/\s*$/, '\n') + body + (tail.trim() ? tail : ';\n');
  if (!dryRun) fs.writeFileSync(file, text);
}

function pluginDefaults() {
  const src = fs.readFileSync(path.join(MOD_WWW, 'js', 'plugins', PLUGIN_NAME + '.js'), 'utf8');
  const params = {};
  const re = /@param\s+(.+?)\s*\n([\s\S]*?)(?=@param|@help|\*\/)/g;
  let m;
  while ((m = re.exec(src))) {
    const def = m[2].match(/@default\s*(.*)/);
    params[m[1].trim()] = def ? def[1].trim() : '';
  }
  const desc = (src.match(/@plugindesc\s*(.*)/) || [])[1] || '';
  return { desc: desc.trim(), params };
}

function install(www) {
  const files = modFiles();
  console.log('Installing into: ' + www + (dryRun ? '  (dry run)' : ''));
  for (const rel of files) {
    const dest = path.join(www, rel);
    console.log('  + ' + rel);
    if (dryRun) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(MOD_WWW, rel), dest);
  }

  const pluginsFile = path.join(www, 'js', 'plugins.js');
  const backup = pluginsFile + '.before-isaacmod';
  if (!fs.existsSync(backup) && !dryRun) fs.copyFileSync(pluginsFile, backup);
  const data = readPlugins(pluginsFile);
  const { desc, params } = pluginDefaults();
  const existing = data.list.find((p) => p && p.name === PLUGIN_NAME);
  if (existing) {
    existing.status = true;
    existing.description = desc;
    existing.parameters = Object.assign({}, params, existing.parameters);
    console.log('  ~ js/plugins.js (IsaacMod already registered, enabled it)');
  } else {
    // Last, so it wraps every other plugin's changes.
    data.list.push({ name: PLUGIN_NAME, status: true, description: desc, parameters: params });
    console.log('  ~ js/plugins.js (registered IsaacMod, backup: plugins.js.before-isaacmod)');
  }
  writePlugins(pluginsFile, data);
  console.log('\nDone. Start a game (new or saved) and walk around for a while...');
}

function remove(www) {
  console.log('Removing from: ' + www + (dryRun ? '  (dry run)' : ''));
  const pluginsFile = path.join(www, 'js', 'plugins.js');
  const data = readPlugins(pluginsFile);
  const before = data.list.length;
  data.list = data.list.filter((p) => !(p && p.name === PLUGIN_NAME));
  if (data.list.length !== before) {
    writePlugins(pluginsFile, data);
    console.log('  ~ js/plugins.js (unregistered IsaacMod)');
  }
  for (const rel of modFiles()) {
    const dest = path.join(www, rel);
    if (!fs.existsSync(dest)) continue;
    console.log('  - ' + rel);
    if (!dryRun) fs.unlinkSync(dest);
  }
  console.log('\nRemoved. Saves made while Isaac was in the party will not load without the mod.');
}

const www = findGame();
if (uninstall) remove(www);
else install(www);
