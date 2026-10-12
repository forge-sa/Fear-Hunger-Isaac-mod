//=============================================================================
// IsaacMod.js  —  The Binding of Isaac x Fear & Hunger
//=============================================================================
/*:
 * @plugindesc v1.0.0 Adds Isaac, the Crying Child, as a recruitable companion.
 * Self-contained: injects his actor, class, skills, items and effects at boot.
 * @author saacxFnH
 *
 * @param Steps Before Encounter
 * @type number
 * @min 0
 * @desc How many steps the player must walk (after the intro, or after
 * loading a save with the mod) before Isaac crawls out of a trapdoor.
 * @default 60
 *
 * @param Steps Before Re-offer
 * @type number
 * @min 0
 * @desc If you tell Isaac "not now", he shows up again after this many steps.
 * @default 200
 *
 * @param Auto Encounter
 * @type boolean
 * @on Enabled
 * @off Disabled
 * @desc Trigger the trapdoor encounter automatically. When disabled, use
 * the plugin command "IsaacMod encounter" or "IsaacMod join".
 * @default true
 *
 * @param Max Party Size
 * @type number
 * @min 1
 * @desc The encounter only happens while the party is smaller than this.
 * @default 4
 *
 * @param Skill Type Name
 * @desc Skill menu Isaac's skills go in. An existing skill type with this
 * name is reused, otherwise a new one is added.
 * @default Skills
 *
 * @param Allow Equipment
 * @type boolean
 * @on Can equip anything
 * @off Fights naked
 * @desc Whether Isaac can equip the game's weapons and armor.
 * @default true
 *
 * @param Dynamic Face
 * @type boolean
 * @desc Isaac's portrait and menu bust get bloodier as his body is hurt.
 * @default true
 *
 * @param Hunger
 * @type boolean
 * @desc Isaac gets hungry and eats like the other companions (Fear & Hunger
 * only). When off he never starves.
 * @default true
 *
 * @help
 * ============================================================================
 *  Isaac x Fear & Hunger
 * ============================================================================
 * Somewhere beneath the dungeons, a child is crying.
 *
 * Once you have walked around for a bit, a trapdoor bursts open and Isaac
 * climbs out. You can take him with you, leave him for now, or abandon him.
 *
 * Skills:
 *   Tears      - Free. A volley of tears at one body part. Also his Attack
 *                while he has no weapon equipped.
 *   Brimstone  - A demonic blood laser through EVERY body part. Costs Mind,
 *                and his eyes bleed (Body) when he uses it.
 *   Yum Heart  - Heals one ally's Body.
 *   The D6     - Roll the die. 1 hurts, 6 saves lives. Battle only.
 * Items (he brings some along):
 *   Bomb       - Damages every body part. Battle only.
 *   Pill       - ??? Could be anything.
 *
 * In Fear & Hunger, Isaac also gets hungry like any other companion (feed
 * him food from the menu), counts toward the party limit, and once he dies
 * he is gone.
 *
 * Plugin commands:
 *   IsaacMod encounter   Play the trapdoor scene right now.
 *   IsaacMod join        Add Isaac to the party (no scene).
 *   IsaacMod leave       Remove Isaac from the party.
 *   IsaacMod items       Give 1 Bomb and 2 Pills.
 *   IsaacMod reset       Forget the encounter (it can happen again).
 *
 * Script calls: IsaacMod.join(), IsaacMod.leave(), IsaacMod.encounter(),
 *   IsaacMod.isInParty(), IsaacMod.ids  (database IDs assigned at boot).
 *
 * Everything is added to the game's database in memory when it loads; no
 * game files are modified. Isaac's IDs are stable as long as the game's own
 * data files don't change. Do not remove the mod while Isaac is in a party
 * you have saved.
 *
 * Isaac and The Binding of Isaac belong to Edmund McMillen / Nicalis.
 * Fear & Hunger belongs to Miro Haverinen. This is an unofficial fan mod;
 * all art and sound in it was made from scratch.
 */

var Imported = Imported || {};
Imported.IsaacMod = '1.0.0';

var IsaacMod = IsaacMod || {};

(function($) {
    'use strict';

    //-------------------------------------------------------------------------
    // Parameters
    //-------------------------------------------------------------------------

    var raw = PluginManager.parameters('IsaacMod');

    function num(v, d) {
        var n = Number(v);
        return v === undefined || v === '' || isNaN(n) ? d : n;
    }

    function bool(v, d) {
        return v === undefined || v === '' ? d : String(v) === 'true';
    }

    var P = $.params = {
        steps: num(raw['Steps Before Encounter'], 60),
        reofferSteps: num(raw['Steps Before Re-offer'], 200),
        autoEncounter: bool(raw['Auto Encounter'], true),
        maxParty: num(raw['Max Party Size'], 4),
        stypeName: raw['Skill Type Name'] || 'Skills',
        allowEquip: bool(raw['Allow Equipment'], true),
        dynamicFace: bool(raw['Dynamic Face'], true),
        hunger: bool(raw['Hunger'], true)
    };

    var FACE = 'Isaac';
    var CHARACTER = '$Isaac';
    var BATTLER = 'Isaac';
    var FX = 'IsaacFX';
    var ICON_SHEET = 'IsaacIcons';
    var ICON_BASE = 9100;
    var ICON = { tears: 0, brimstone: 1, heart: 2, d6: 3, pill: 4, bomb: 5, isaac: 6, bloodTear: 7 };
    var FACES = { crying: 0, hurt: 1, wounded: 2, terrified: 3, demonic: 4, smile: 5, dead: 6, determined: 7 };

    $.ids = {};
    $.FACES = FACES;
    $._injected = false;

    function icon(name) {
        return ICON_BASE + ICON[name];
    }

    //-------------------------------------------------------------------------
    // Unencrypted assets
    //
    // Fear & Hunger ships encrypted images/audio. The mod's files are plain
    // .png/.ogg, so they must skip the decrypter.
    //-------------------------------------------------------------------------

    var MOD_IMAGE = /^img\/(characters|faces|animations|system|pictures|sv_actors)\/(%24|\$)?Isaac[A-Za-z0-9_%]*\.png$/;
    var MOD_AUDIO = /^audio\/se\/Isaac_[A-Za-z0-9_]+\.(ogg|m4a)$/;

    $.isModImage = function(url) {
        return MOD_IMAGE.test(String(url));
    };

    $.isModAudio = function(url) {
        return MOD_AUDIO.test(String(url));
    };

    if (typeof Decrypter !== 'undefined') {
        var _Decrypter_checkImgIgnore = Decrypter.checkImgIgnore;
        Decrypter.checkImgIgnore = function(url) {
            return $.isModImage(url) || _Decrypter_checkImgIgnore.call(this, url);
        };
    }

    function withoutAudioDecryption(fn) {
        var saved = Decrypter.hasEncryptedAudio;
        Decrypter.hasEncryptedAudio = false;
        try {
            return fn();
        } finally {
            Decrypter.hasEncryptedAudio = saved;
        }
    }

    if (typeof WebAudio !== 'undefined' && WebAudio.prototype._load) {
        var _WebAudio_load = WebAudio.prototype._load;
        WebAudio.prototype._load = function(url) {
            if ($.isModAudio(url)) {
                this._isaacPlain = true;
                var self = this;
                return withoutAudioDecryption(function() {
                    return _WebAudio_load.call(self, url);
                });
            }
            return _WebAudio_load.call(this, url);
        };
    }

    if (typeof WebAudio !== 'undefined' && WebAudio.prototype._onXhrLoad) {
        var _WebAudio_onXhrLoad = WebAudio.prototype._onXhrLoad;
        WebAudio.prototype._onXhrLoad = function(xhr) {
            if (this._isaacPlain) {
                var self = this;
                return withoutAudioDecryption(function() {
                    return _WebAudio_onXhrLoad.call(self, xhr);
                });
            }
            return _WebAudio_onXhrLoad.call(this, xhr);
        };
    }

    //-------------------------------------------------------------------------
    // Database injection
    //-------------------------------------------------------------------------

    function allDatabaseLoaded() {
        var files = DataManager._databaseFiles || [];
        for (var i = 0; i < files.length; i++) {
            if (!window[files[i].name]) return false;
        }
        return files.length > 0;
    }

    // Normal path: inject the moment the last database file arrives, before
    // other plugins parse notetags in DataManager.isDatabaseLoaded().
    var _DataManager_onLoad = DataManager.onLoad;
    DataManager.onLoad = function(object) {
        _DataManager_onLoad.call(this, object);
        if (!$._injected && object && object !== window.$dataMap && allDatabaseLoaded()) {
            $.inject(false);
        }
    };

    // Fallback: something swallowed onLoad; inject late and copy over any
    // properties other plugins already attached to existing entries.
    var _Scene_Boot_start = Scene_Boot.prototype.start;
    Scene_Boot.prototype.start = function() {
        if (!$._injected) $.inject(true);
        _Scene_Boot_start.call(this);
    };

    function preloadIcons() {
        if (ImageManager.reserveSystem) ImageManager.reserveSystem(ICON_SHEET);
        else ImageManager.loadSystem(ICON_SHEET);
    }

    // MV 1.6+ preloads system images from a static method, older versions
    // from an instance method.
    if (Scene_Boot.loadSystemImages) {
        var _Scene_Boot_loadSystemImages = Scene_Boot.loadSystemImages;
        Scene_Boot.loadSystemImages = function() {
            _Scene_Boot_loadSystemImages.apply(this, arguments);
            preloadIcons();
        };
    }
    if (Scene_Boot.prototype.loadSystemImages) {
        var _Scene_Boot_prototype_loadSystemImages = Scene_Boot.prototype.loadSystemImages;
        Scene_Boot.prototype.loadSystemImages = function() {
            _Scene_Boot_prototype_loadSystemImages.apply(this, arguments);
            preloadIcons();
        };
    }

    $.inject = function(late) {
        $._injected = true;
        try {
            injectAll(late);
            $._ready = true;
        } catch (e) {
            $._error = e;
            console.error('[IsaacMod] Failed to add Isaac to the database:', e);
        }
    };

    function median(values, fallback) {
        var v = values.filter(function(x) {
            return typeof x === 'number' && isFinite(x) && x > 0;
        }).sort(function(a, b) {
            return a - b;
        });
        if (!v.length) return fallback;
        var m = Math.floor(v.length / 2);
        return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
    }

    function validActors() {
        return $dataActors.filter(function(a) {
            return a && a.name && $dataClasses[a.classId] && $dataClasses[a.classId].params;
        });
    }

    // Isaac's stats are derived from the game's own cast so he fits its
    // balance: fragile, but quick, lucky and good with "magic".
    var STAT_SCALE = [0.7, 1.2, 0.8, 0.6, 1.3, 1.0, 1.15, 1.6];
    var STAT_FALLBACK = [100, 30, 15, 12, 15, 12, 15, 15];

    function deriveStats() {
        var actors = validActors();
        var params = [];
        var medians = [];
        for (var p = 0; p < 8; p++) {
            var values = actors.map(function(a) {
                var lv = Math.max(1, Math.min(a.initialLevel || 1, 99));
                var row = $dataClasses[a.classId].params[p] || [];
                return row[lv] !== undefined ? row[lv] : row[1];
            });
            medians.push(median(values, STAT_FALLBACK[p]));
            params.push(Math.max(1, Math.round(medians[p] * STAT_SCALE[p])));
        }
        var levels = actors.map(function(a) { return a.initialLevel || 1; });
        var weaponAtk = median(($dataWeapons || []).filter(function(w) {
            return w && w.name;
        }).map(function(w) {
            return w.params ? w.params[2] : 0;
        }), 0);
        return {
            params: params,
            medians: medians,
            level: Math.round(median(levels, 1)),
            maxLevel: actors.length ? actors[0].maxLevel || 99 : 99,
            weaponAtk: Math.round(weaponAtk),
            reference: actors[0] || null
        };
    }

    // The game's own Attack skill, so damage scales against its enemies.
    function attackSkill() {
        var atk = $dataSkills[1];
        var ok = atk && atk.damage && atk.damage.type === 1 && String(atk.damage.formula || '').trim();
        return {
            formula: ok ? String(atk.damage.formula) : 'a.atk * 4 - b.def * 2',
            elementId: atk && atk.damage ? atk.damage.elementId : 0
        };
    }

    function withAtkBonus(formula, bonus) {
        if (!bonus) return formula;
        return formula.replace(/\ba\.atk\b/g, '(a.atk + ' + bonus + ')');
    }

    function withFixedAtk(formula, value) {
        return formula.replace(/\ba\.atk\b/g, '(' + value + ')');
    }

    function damage(type, formula, elementId, variance) {
        return {
            critical: type === 1,
            elementId: elementId || 0,
            formula: formula || '0',
            type: type,
            variance: variance === undefined ? 20 : variance
        };
    }

    function se(name, volume, pitch) {
        return { name: name, pan: 0, pitch: pitch || 100, volume: volume || 90 };
    }

    // [pattern, x, y, scale, rotation, mirror, opacity, blend]
    function cell(p, x, y, s, r, op, blend) {
        return [p, x || 0, y || 0, s || 100, r || 0, 0, op === undefined ? 255 : op, blend || 0];
    }

    function timing(frame, sound, flashScope, color, duration) {
        return {
            flashColor: color || [255, 255, 255, 255],
            flashDuration: duration || 5,
            flashScope: flashScope || 0,
            frame: frame,
            se: sound || null
        };
    }

    // position: 0 head, 1 center, 2 feet, 3 screen
    function animation(name, position, frames, timings) {
        return {
            id: 0,
            animation1Hue: 0,
            animation1Name: FX,
            animation2Hue: 0,
            animation2Name: '',
            frames: frames,
            name: name,
            position: position,
            timings: timings
        };
    }

    function isSideView() {
        try {
            return !!Game_System.prototype.isSideView.call({});
        } catch (e) {
            return !!$dataSystem.optSideView;
        }
    }

    // Front view normally hides the party, but YEP_BattleEngineCore can show
    // actor sprites anyway ("Front Actor Sprite"); Fear & Hunger does.
    function actorSpritesVisible() {
        if (isSideView()) return true;
        var Y = window.Yanfly;
        return !!(Y && Y.Param && String(Y.Param.BECFrontSprite).trim() === 'true');
    }

    function brimstoneFrames(sideView) {
        var xs = [-576, -384, -192, 0, 192, 384, 576];
        var frames = [];
        function sweep(p, from, op) {
            return xs.filter(function(x) { return x <= from; }).map(function(x) {
                return cell(p, x, sideView ? 0 : -20, 100, 0, op);
            });
        }
        // Side view: the party stands on the right, so the beam travels
        // right to left. Front view: it rises from the bottom of the screen.
        var origin = sideView ? [300, 40] : [0, 250];
        function source(p, op) {
            return sideView ? [] : [cell(p, 0, 234, 100, 90, op), cell(p, 0, 42, 100, 90, op)];
        }
        frames.push([cell(32, origin[0], origin[1], 50, 0, 140, 1)]);
        frames.push([cell(32, origin[0], origin[1], 80, 0, 190, 1)]);
        frames.push([cell(32, origin[0], origin[1], 110, 0, 230, 1), cell(33, origin[0], origin[1] - 20, 60, 0, 200, 1)]);
        frames.push([cell(32, origin[0], origin[1], 140, 0, 255, 1)]);
        frames.push(source(10, 255).concat(sideView ? sweep(10, 576, 255).filter(function(c) { return c[1] >= 192; }) : []));
        frames.push(source(11, 255).concat(sideView ? sweep(11, 576, 255).filter(function(c) { return c[1] >= 0; }) : [cell(32, 0, -20, 120, 0, 200, 1)]));
        frames.push(source(12, 255).concat(sweep(11, 576, 255)));
        for (var i = 0; i < 7; i++) {
            var p = i % 2 ? 13 : 12;
            frames.push(source(p, 255).concat(sweep(p, 576, 255), [cell(32, sideView ? -150 : 0, sideView ? 0 : -20, 180 + (i % 3) * 20, 0, 255, 1)]));
        }
        [[11, 255], [11, 220], [14, 200], [14, 120], [14, 60]].forEach(function(f) {
            frames.push(source(f[0], f[1]).concat(sweep(f[0], 576, f[1])));
        });
        return frames;
    }

    function makeAnimations(sideView, actorsVisible) {
        var A = {};
        // Animations on allies play on the actor when the party is drawn,
        // otherwise in the middle of the screen.
        var onAlly = actorsVisible ? 1 : 3;

        A.tears = animation('Isaac: Tears', 1, [
            [cell(0, 0, -70, 60)],
            [cell(0, 0, -45, 70)],
            [cell(0, 0, -20, 80)],
            [cell(1, 0, 0, 100)],
            [cell(2, 0, 0, 105)],
            [cell(3, 0, 0, 115, 0, 230)],
            [cell(4, 0, 0, 125, 0, 160)],
            [cell(4, 0, 0, 135, 0, 80)]
        ], [
            timing(0, se('Isaac_Tear', 85)),
            timing(3, se('Isaac_Splash', 80, 110), 1, [150, 210, 255, 170], 4)
        ]);

        A.brimstone = animation('Isaac: Brimstone', 3, brimstoneFrames(sideView), [
            timing(0, se('Isaac_BrimCharge', 90)),
            timing(4, se('Isaac_Brimstone', 100), 2, [255, 40, 40, 170], 6),
            timing(7, null, 1, [255, 0, 0, 220], 10),
            timing(11, null, 1, [255, 0, 0, 160], 6)
        ]);

        var s = actorsVisible ? 0.7 : 1;
        function sc(v) { return Math.round(v * s); }
        A.heart = animation('Isaac: Yum Heart', onAlly, [
            [cell(5, 0, 0, sc(60), 0, 200), cell(31, 0, 0, sc(80), 0, 120, 1)],
            [cell(6, 0, 0, sc(80)), cell(31, 0, 0, sc(100), 0, 140, 1)],
            [cell(7, 0, 0, sc(100)), cell(31, 0, 0, sc(130), 0, 160, 1)],
            [cell(7, 0, -4, sc(110)), cell(31, 0, 0, sc(140), 0, 140, 1)],
            [cell(7, 0, 0, sc(104)), cell(31, 0, 0, sc(140), 0, 100, 1)],
            [cell(8, 0, -8, sc(110), 0, 220)],
            [cell(8, 0, -16, sc(115), 0, 160)],
            [cell(9, 0, -24, sc(120), 0, 120)],
            [cell(9, 0, -32, sc(125), 0, 60)]
        ], [
            timing(0, se('Isaac_Heart', 90)),
            timing(2, null, actorsVisible ? 1 : 2, [255, 120, 140, 120], 6)
        ]);

        A.bomb = animation('Isaac: Bomb', 1, [
            [cell(15, 0, -60, 80)],
            [cell(15, 0, -35, 80)],
            [cell(15, 0, -10, 80)],
            [cell(16, 0, 0, 110, 0, 255, 1)],
            [cell(17, 0, 0, 110)],
            [cell(17, 0, -6, 125)],
            [cell(18, 0, -10, 130)],
            [cell(18, 0, -16, 135, 0, 220)],
            [cell(19, 0, -24, 140, 0, 170)],
            [cell(19, 0, -32, 150, 0, 100)]
        ], [
            timing(0, se('Isaac_Fuse', 70)),
            timing(3, se('Isaac_Explosion', 95), 2, [255, 240, 200, 170], 4),
            timing(4, null, 1, [255, 120, 0, 200], 8)
        ]);

        A.pill = animation('Isaac: Pill', onAlly, [
            [cell(20, 0, 0, sc(70), -20)],
            [cell(20, 0, 0, sc(85))],
            [cell(21, 0, 0, sc(100), 20)],
            [cell(22, 0, 0, sc(100)), cell(31, 0, 0, sc(100), 0, 120, 1)],
            [cell(22, 0, 0, sc(115), 30)],
            [cell(23, 0, 0, sc(125), 60, 200)],
            [cell(24, 0, 0, sc(135), 90, 120)]
        ], [
            timing(0, se('Isaac_Pill', 90)),
            timing(3, null, actorsVisible ? 1 : 2, [200, 255, 220, 100], 4)
        ]);

        var bounce = [-90, -50, -15, -35, -8, -20, 0, -8, 0, 0, 0];
        var faces = [27, 25, 30, 26, 29, 28, 25, 27, 30, 26, 28];
        var dieY = actorsVisible ? -60 : 0;
        A.d6Roll = animation('Isaac: D6 (roll)', onAlly, bounce.map(function(y, k) {
            return [cell(faces[k], (actorsVisible ? -20 : -70) + k * (actorsVisible ? 3 : 7), dieY + y * s, sc(90), (k * 47) % 360)];
        }), [timing(0, se('Isaac_Dice', 95))]);

        A.d6Result = [null];
        for (var n = 1; n <= 6; n++) {
            var face = 24 + n;
            var glow = n === 1 ? 32 : 31;
            A.d6Result.push(animation('Isaac: D6 (' + n + ')', onAlly, [
                [cell(face, 0, dieY, sc(100)), cell(glow, 0, dieY, sc(120), 0, 180, 1)],
                [cell(face, 0, dieY, sc(110)), cell(glow, 0, dieY, sc(140), 0, 200, 1)],
                [cell(face, 0, dieY, sc(115)), cell(glow, 0, dieY, sc(160), 0, 200, 1)],
                [cell(face, 0, dieY, sc(112)), cell(glow, 0, dieY, sc(160), 0, 160, 1)],
                [cell(face, 0, dieY, sc(110)), cell(glow, 0, dieY, sc(150), 0, 120, 1)],
                [cell(face, 0, dieY, sc(110)), cell(glow, 0, dieY, sc(140), 0, 80, 1)],
                [cell(face, 0, dieY, sc(110), 0, 220)],
                [cell(face, 0, dieY, sc(110), 0, 160)],
                [cell(face, 0, dieY, sc(110), 0, 80)]
            ], [
                timing(0, se(n === 1 ? 'Isaac_Hurt' : 'Isaac_Heart', n === 1 ? 80 : 60, n === 1 ? 100 : 130),
                    2, n === 1 ? [255, 0, 0, 120] : [255, 255, 200, 100], 4)
            ]));
        }
        return A;
    }

    function skill(o) {
        return {
            id: 0,
            animationId: o.animationId || 0,
            damage: o.damage || damage(0, '0', 0, 0),
            description: o.description || '',
            effects: o.effects || [],
            hitType: o.hitType || 0,
            iconIndex: o.iconIndex || 0,
            message1: o.message1 || '',
            message2: o.message2 || '',
            mpCost: o.mpCost || 0,
            name: o.name,
            note: o.note || '',
            occasion: o.occasion || 0,
            repeats: o.repeats || 1,
            requiredWtypeId1: 0,
            requiredWtypeId2: 0,
            scope: o.scope,
            speed: o.speed || 0,
            stypeId: o.stypeId || 0,
            successRate: o.successRate || 100,
            tpCost: 0,
            tpGain: 0
        };
    }

    function item(o) {
        return {
            id: 0,
            animationId: o.animationId || 0,
            consumable: true,
            damage: o.damage || damage(0, '0', 0, 0),
            description: o.description || '',
            effects: o.effects || [],
            hitType: o.hitType || 0,
            iconIndex: o.iconIndex || 0,
            itypeId: 1,
            name: o.name,
            note: o.note || '',
            occasion: o.occasion || 0,
            price: o.price || 0,
            repeats: 1,
            scope: o.scope,
            speed: o.speed || 0,
            successRate: 100,
            tpGain: 0
        };
    }

    function filled(value) {
        var row = [];
        for (var i = 0; i < 100; i++) row.push(value);
        return row;
    }

    function classTraits(stats) {
        var traits = [];
        var ref = stats.reference;
        // Base hit/evasion/crit/target rates come from one of the game's own
        // characters, otherwise physical attacks would always miss.
        var sources = ref ? [ref.traits || [], ($dataClasses[ref.classId] || {}).traits || []] : [];
        sources.forEach(function(list) {
            list.forEach(function(t) {
                if (t.code === 22 || t.code === 23) traits.push({ code: t.code, dataId: t.dataId, value: t.value });
            });
        });
        function has(code, dataId) {
            return traits.some(function(t) { return t.code === code && t.dataId === dataId; });
        }
        if (!has(22, 0)) traits.push({ code: 22, dataId: 0, value: 0.95 });
        if (!has(22, 1)) traits.push({ code: 22, dataId: 1, value: 0.05 });
        if (!has(22, 2)) traits.push({ code: 22, dataId: 2, value: 0.04 });
        if (!has(23, 0)) traits.push({ code: 23, dataId: 0, value: 1 });
        traits.push({ code: 22, dataId: 1, value: 0.1 });   // small and slippery: +10% evasion
        traits.push({ code: 41, dataId: $.ids.stype, value: 1 });
        if (P.allowEquip) {
            var i;
            for (i = 1; i < ($dataSystem.weaponTypes || []).length; i++) {
                traits.push({ code: 51, dataId: i, value: 0 });
            }
            for (i = 1; i < ($dataSystem.armorTypes || []).length; i++) {
                traits.push({ code: 52, dataId: i, value: 0 });
            }
        }
        return traits;
    }

    function push(array, obj, late) {
        obj.id = array.length;
        if (late) adoptExtraKeys(array, obj);
        array.push(obj);
        if (obj.note !== undefined && DataManager.extractMetadata) DataManager.extractMetadata(obj);
        return obj.id;
    }

    // Late injection only: other plugins have already decorated existing
    // entries (action sequences, cost fields...). Give ours the same shape.
    function adoptExtraKeys(array, obj) {
        var template = null;
        for (var i = 1; i < array.length; i++) {
            if (array[i]) { template = array[i]; break; }
        }
        if (!template) return;
        Object.keys(template).forEach(function(key) {
            if (obj[key] === undefined && key !== 'meta') {
                obj[key] = JsonEx.makeDeepCopy(template[key]);
            }
        });
    }

    function skillType(name) {
        var types = $dataSystem.skillTypes;
        for (var i = 1; i < types.length; i++) {
            if (String(types[i] || '').trim().toLowerCase() === String(name).trim().toLowerCase()) return i;
        }
        types.push(name);
        return types.length - 1;
    }

    function injectAll(late) {
        var ids = $.ids;
        var stats = deriveStats();
        var atk = attackSkill();
        var sideView = isSideView();
        $.stats = stats;
        $.view = { sideView: sideView, actorsVisible: actorSpritesVisible() };

        ids.stype = skillType(P.stypeName);

        var A = makeAnimations(sideView, $.view.actorsVisible);
        ids.animTears = push($dataAnimations, A.tears, late);
        ids.animBrimstone = push($dataAnimations, A.brimstone, late);
        ids.animHeart = push($dataAnimations, A.heart, late);
        ids.animBomb = push($dataAnimations, A.bomb, late);
        ids.animPill = push($dataAnimations, A.pill, late);
        ids.animD6Roll = push($dataAnimations, A.d6Roll, late);
        ids.animD6 = [0];
        for (var n = 1; n <= 6; n++) ids.animD6.push(push($dataAnimations, A.d6Result[n], late));

        var mmp = stats.params[1];
        var tearBonus = Math.round(stats.weaponAtk * 0.75);

        ids.skillTears = push($dataSkills, skill({
            name: 'Tears',
            iconIndex: icon('tears'),
            description: 'Cry at one body part until it breaks.\nIt is all he knows how to do.',
            stypeId: ids.stype,
            scope: 1,
            occasion: 1,
            hitType: 1,
            repeats: 2,
            animationId: ids.animTears,
            message1: ' cries at the enemy!',
            // one Attack's worth, split into two chances to hit
            damage: damage(1, '(' + withAtkBonus(atk.formula, tearBonus) + ') * 0.5', atk.elementId, 20)
        }), late);

        ids.skillBrimstone = push($dataSkills, skill({
            name: 'Brimstone',
            iconIndex: icon('brimstone'),
            description: 'A torrent of demonic blood through every body\npart at once. His eyes bleed for it.',
            stypeId: ids.stype,
            scope: 2,
            occasion: 1,
            hitType: 2,
            successRate: 85,
            mpCost: Math.max(1, Math.ceil(mmp * 0.5)),
            animationId: ids.animBrimstone,
            message1: '\'s eyes turn black...',
            message2: 'BRIMSTONE!',
            damage: damage(1, '(' + withAtkBonus(atk.formula, stats.weaponAtk) + ') * 1.2', atk.elementId, 15)
        }), late);

        ids.skillYumHeart = push($dataSkills, skill({
            name: 'Yum Heart',
            iconIndex: icon('heart'),
            description: 'Squeeze a warm, beating heart over an ally.\nRestores their body.',
            stypeId: ids.stype,
            scope: 7,
            occasion: 0,
            mpCost: Math.max(1, Math.ceil(mmp * 0.3)),
            animationId: ids.animHeart,
            message1: ' squeezes a beating heart!',
            damage: damage(3, 'b.mhp * 0.4', 0, 10)
        }), late);

        ids.skillD6 = push($dataSkills, skill({
            name: 'The D6',
            iconIndex: icon('d6'),
            description: 'Roll the die and accept what it gives you.\n1 hurts. 6 saves lives.',
            stypeId: ids.stype,
            scope: 11,
            occasion: 1,
            mpCost: Math.max(1, Math.ceil(mmp * 0.25)),
            animationId: ids.animD6Roll,
            message1: ' rolls the D6...'
        }), late);

        // Bombs hurt the same no matter who throws them: an average armed
        // party member's attack.
        var bombAtk = Math.round(stats.medians[2] + stats.weaponAtk);
        ids.itemBomb = push($dataItems, item({
            name: 'Bomb',
            iconIndex: icon('bomb'),
            description: 'Light it, throw it, cover your ears.\nDamages every body part.',
            scope: 2,
            occasion: 1,
            animationId: ids.animBomb,
            price: 15,
            damage: damage(1, withFixedAtk(atk.formula, bombAtk), 0, 15)
        }), late);

        ids.itemPill = push($dataItems, item({
            name: 'Pill',
            iconIndex: icon('pill'),
            description: 'A white and blue pill of unknown origin.\nSwallowing it could do anything.',
            scope: 7,
            occasion: 0,
            animationId: ids.animPill,
            price: 10
        }), late);

        var refClass = stats.reference ? $dataClasses[stats.reference.classId] : null;
        var cls = {
            id: 0,
            // Same EXP curve as the cast: Fear & Hunger keeps hunger in EXP.
            expParams: refClass && refClass.expParams ? refClass.expParams.slice() : [30, 20, 30, 30],
            traits: classTraits(stats),
            learnings: [ids.skillTears, ids.skillBrimstone, ids.skillYumHeart, ids.skillD6].map(function(id) {
                return { level: 1, note: '', skillId: id };
            }),
            name: 'Crying Child',
            note: '',
            params: stats.params.map(filled)
        };
        ids.classId = push($dataClasses, cls, late);

        ids.actor = push($dataActors, {
            id: 0,
            battlerName: BATTLER,
            characterIndex: 0,
            characterName: CHARACTER,
            classId: ids.classId,
            equips: [],
            faceIndex: FACES.crying,
            faceName: FACE,
            traits: [],
            initialLevel: stats.level,
            maxLevel: Math.max(stats.level, stats.maxLevel),
            name: 'Isaac',
            nickname: 'the Crying Child',
            note: '',
            profile: 'He hid in the basement when Mother heard the\nvoice. The basement kept going down. Down here.'
        }, late);

        ids.ceEncounter = push($dataCommonEvents, {
            id: 0,
            list: encounterEvent(),
            name: 'Isaac: Trapdoor',
            switchId: 1,
            trigger: 0
        }, late);

        ids.ceMessage = push($dataCommonEvents, {
            id: 0,
            list: [
                { code: 355, indent: 0, parameters: ['IsaacMod._flushMessages(this);'] },
                { code: 0, indent: 0, parameters: [] }
            ],
            name: 'Isaac: Message',
            switchId: 1,
            trigger: 0
        }, late);

        detectFearAndHunger();
    }

    //-------------------------------------------------------------------------
    // Fear & Hunger integration
    //
    // The game tracks companions by hard-coded actor IDs, so a new companion
    // has to be wired in. Everything is looked up by name; anything missing
    // (another game, a different version) is simply skipped.
    //-------------------------------------------------------------------------

    var FH = $.fh = {};

    function indexByName(list, name) {
        for (var i = 1; i < list.length; i++) {
            var entry = list[i];
            var n = entry && typeof entry === 'object' ? entry.name : entry;
            if (n === name) return i;
        }
        return 0;
    }

    function detectFearAndHunger() {
        FH.startSwitch = indexByName($dataSystem.switches || [], 'START');
        FH.noDecreaseSwitch = indexByName($dataSystem.switches || [], '//NO_DECREASING//');
        FH.busySwitch = indexByName($dataSystem.switches || [], 'suicide_inprocess');
        FH.partySizeVar = indexByName($dataSystem.variables || [], 'PartySize');
        FH.hungerStates = [1, 2, 3, 4, 5].map(function(n) { return indexByName($dataStates, 'Hunger LVL ' + n); });
        FH.parasiteState = indexByName($dataStates, 'Parasites');
        FH.food = {};
        HUNGER.food.forEach(function(f) {
            var id = indexByName($dataStates, f.state);
            if (id) FH.food[id] = f;
        });
        FH.deathCheck = !!indexByName($dataCommonEvents, 'deathCheck');
        FH.hunger = P.hunger && FH.hungerStates.every(Boolean) && Object.keys(FH.food).length === 3 &&
            !!indexByName($dataCommonEvents, 'FOOD_small');
        FH.partyCheck = patchPartyCheck();
    }

    // Party_Check recounts the party into "PartySize" from a fixed list of
    // actor IDs; every recruit and party-full check reads that variable.
    function patchPartyCheck() {
        var ceId = indexByName($dataCommonEvents, 'Party_Check');
        var v = FH.partySizeVar;
        if (!ceId || !v) return false;
        var list = $dataCommonEvents[ceId].list;
        var last = list[list.length - 1];
        if (!last || last.code !== 0 || last.indent !== 0) return false;
        list.splice(list.length - 1, 0,
            { code: 111, indent: 0, parameters: [4, $.ids.actor, 0] },
            { code: 122, indent: 1, parameters: [v, v, 1, 0, 1] },
            { code: 0, indent: 1, parameters: [] },
            { code: 412, indent: 0, parameters: [] });
        return true;
    }

    // Hunger, as the game's HUNGER_of_* / HUNGER LEVELS_* / FOOD_* events do
    // it for every other companion: EXP is the stomach (57 = starved, 156 =
    // full), one point drains every 800 frames (400 with parasites).
    var HUNGER = $.HUNGER = {
        interval: 800,
        parasiteInterval: 400,
        full: 99,
        cap: 157,
        starveAt: 57,
        warnings: [
            { at: 128, text: '%1 is starting to feel hungry...' },
            { at: 108, text: '%1 is weak from hunger.' },
            { at: 88, text: '%1 is ill from hunger.' },
            { at: 78, text: 'Hunger is driving %1 mad.' },
            { at: 68, text: 'Hunger is crippling %1.' },
            { at: 63, text: '%1 is blind from hunger.' }
        ],
        // [EXP above, max body rate] for hunger levels 0..5
        levels: [[108, 1], [88, 0.9], [78, 0.8], [68, 0.7], [63, 0.5], [-Infinity, 0.3]],
        food: [
            { state: 'Food small', amount: 7, text: '%1 feels a little less hungry.' },
            { state: 'Food medium', amount: 30, text: '%1 feels less hungry.' },
            { state: 'Food large', amount: 90, text: '%1 feels a lot less hungry.' }
        ]
    };

    function hungerLevel(exp) {
        for (var i = 0; i < HUNGER.levels.length; i++) {
            if (exp > HUNGER.levels[i][0]) return i;
        }
        return HUNGER.levels.length - 1;
    }

    function nameCode() {
        return '\\N[' + $.ids.actor + ']';
    }

    function gab(text) {
        if (!Imported.YEP_GabWindow) return;
        ($._gabs = $._gabs || []).push(text.replace('%1', nameCode()));
    }

    var flushGabs = $.flushGabs = function() {
        var scene = SceneManager._scene;
        if (!$._gabs || !$._gabs.length || !scene || !scene._gabWindow) return;
        while ($._gabs.length) {
            var it = new Game_Interpreter();
            if (it.clearGabInformation) it.clearGabInformation();
            it.pluginCommand('GabText', $._gabs.shift().split(' '));
            it.pluginCommand('ShowGab', []);
        }
    };

    // Removes the wrong hunger states, adds the right one and shrinks max
    // body like HUNGER LEVELS_* does (by the same ratios of his own body).
    function applyHungerLevel(isaac) {
        var level = hungerLevel(isaac.currentExp());
        FH.hungerStates.forEach(function(id, i) {
            if (i + 1 === level) {
                if (!isaac.isStateAffected(id)) isaac.addState(id);
            } else if (isaac.isStateAffected(id)) {
                isaac.removeState(id);
            }
        });
        if (isaac.setMaxHp) {
            var base = $dataClasses[$.ids.classId].params[0][isaac.level] || $dataClasses[$.ids.classId].params[0][1];
            isaac.setMaxHp(Math.round(base * HUNGER.levels[level][1]) + ($.state().bodyBonus || 0));
        }
    }

    function setStomach(isaac, exp) {
        isaac.changeExp(Math.max(0, exp), false);
    }

    function startFull(isaac) {
        var floor = isaac.expForLevel(isaac.level);
        setStomach(isaac, Math.min(floor + HUNGER.full, HUNGER.cap - 1));
        applyHungerLevel(isaac);
    }

    function eat(isaac, stateId) {
        var food = FH.food[stateId];
        isaac.removeState(stateId);
        var amount = Math.max(0, Math.min(food.amount, HUNGER.cap - 1 - isaac.currentExp()));
        setStomach(isaac, isaac.currentExp() + amount);
        gab(food.text);
        applyHungerLevel(isaac);
    }

    function starve(isaac) {
        gab('%1 feels dizzy...');
        isaac.addState(isaac.deathStateId());
        $gameParty.removeActor($.ids.actor);
        $.state().lost = 'starved';
    }

    function hungerTick(isaac) {
        if (FH.startSwitch && !$gameSwitches.value(FH.startSwitch)) return;
        var st = $.state();
        st.hungerClock = (st.hungerClock || 0) + 1;
        var slow = FH.parasiteState && isaac.isStateAffected(FH.parasiteState);
        if (st.hungerClock < (slow ? HUNGER.parasiteInterval : HUNGER.interval)) return;
        st.hungerClock = 0;
        if (FH.busySwitch && $gameSwitches.value(FH.busySwitch)) return;
        if (FH.noDecreaseSwitch && $gameSwitches.value(FH.noDecreaseSwitch)) return;
        setStomach(isaac, isaac.currentExp() - 1);
        var exp = isaac.currentExp();
        var warning = HUNGER.warnings.filter(function(w) { return w.at === exp; })[0];
        if (warning) gab(warning.text);
        if (exp <= HUNGER.starveAt) starve(isaac);
        else applyHungerLevel(isaac);
    }

    $.updateCompanion = function() {
        if (!$._ready || !$.isInParty() || $gameParty.inBattle()) return;
        var isaac = $gameActors.actor($.ids.actor);
        if (FH.deathCheck && isaac.isDead()) {
            // Fear & Hunger's deathCheck: fallen companions stay dead.
            gab('%1 has stopped crying.');
            $gameParty.removeActor($.ids.actor);
            $.state().lost = 'dead';
            return;
        }
        if (FH.hunger) hungerTick(isaac);
    };

    // Food works by giving the eater a "Food small/medium/large" state, then
    // FOOD_* checks each known companion for it. Isaac eats it right away.
    var _Game_Battler_addState = Game_Battler.prototype.addState;
    Game_Battler.prototype.addState = function(stateId) {
        _Game_Battler_addState.call(this, stateId);
        if (FH.hunger && FH.food[stateId] && isIsaac(this) && this.isStateAffected(stateId)) {
            eat(this, stateId);
        }
    };

    var _Game_Party_addActor = Game_Party.prototype.addActor;
    Game_Party.prototype.addActor = function(actorId) {
        var wasIn = this._actors.indexOf(actorId) >= 0;
        _Game_Party_addActor.call(this, actorId);
        if ($._ready && actorId === $.ids.actor && !wasIn) {
            var st = $.state();
            st.joined = true;
            st.lost = null;
            if (FH.hunger && !st.fed) {
                st.fed = true;
                startFull($gameActors.actor(actorId));
            }
        }
    };

    //-------------------------------------------------------------------------
    // The trapdoor encounter
    //-------------------------------------------------------------------------

    function cmd(code, indent, parameters) {
        return { code: code, indent: indent, parameters: parameters };
    }

    // Written the way the game writes its dialogue: no portrait, the
    // speaker's name in grey, the line in quotes.
    function say(list, indent, lines, speaker) {
        list.push(cmd(101, indent, ['', 0, 0, 2]));
        if (speaker) list.push(cmd(401, indent, ['\\c[7]' + speaker + '\\c[0]']));
        lines.forEach(function(line) {
            list.push(cmd(401, indent, [line]));
        });
    }

    function script(list, indent, code) {
        list.push(cmd(355, indent, [code]));
    }

    function encounterEvent() {
        var ids = $.ids;
        var L = [];
        script(L, 0, 'IsaacMod._onEncounterStart();');
        L.push(cmd(250, 0, [se('Isaac_Cry', 60, 95)]));
        say(L, 0, ['Somewhere beneath your feet, a child is sobbing.']);
        L.push(cmd(225, 0, [6, 6, 24, true]));
        L.push(cmd(250, 0, [se('Isaac_Explosion', 45, 140)]));
        say(L, 0, [
            'A rotten trapdoor bursts open. A small, bald boy',
            'crawls out of the hole, naked and shaking, tears',
            'streaming down his face.'
        ]);
        say(L, 0, ['"M-mom...? Is that you?"'], 'Isaac');
        say(L, 0, ['"...No. You\'re not Mom. Mom wouldn\'t look at me', 'like that."'], 'Isaac');
        say(L, 0, [
            '"Mom heard a voice from above. It told her I was',
            'bad. So I ran, and the basement just kept going',
            'down..."'
        ], 'Isaac');
        say(L, 0, ['"Please, can I come with you? I can fight!', 'I cry really, really hard."'], 'Isaac');
        L.push(cmd(102, 0, [['Take him with you', 'Not now', 'Abandon him'], 1, 0, 2, 0]));

        L.push(cmd(402, 0, [0, 'Take him with you']));
        say(L, 1, ['"R-really? Thank you... I won\'t be any trouble.', 'Promise."'], 'Isaac');
        L.push(cmd(129, 1, [ids.actor, 0, 1]));
        L.push(cmd(250, 1, [se('Isaac_Heart', 80)]));
        say(L, 1, ['\\I[' + icon('isaac') + ']Isaac joined the party.']);
        L.push(cmd(126, 1, [ids.itemBomb, 0, 0, 1]));
        L.push(cmd(126, 1, [ids.itemPill, 0, 0, 2]));
        say(L, 1, [
            'He presses a \\I[' + icon('bomb') + ']Bomb and two \\I[' + icon('pill') + ']Pills into your hand.',
            'You decide not to ask where he was keeping them.'
        ]);
        script(L, 1, 'IsaacMod._onEncounterEnd("joined");');
        L.push(cmd(0, 1, []));

        L.push(cmd(402, 0, [1, 'Not now']));
        say(L, 1, ['"...Okay. I\'ll hide in the basement again.', 'Maybe you\'ll find me later."'], 'Isaac');
        script(L, 1, 'IsaacMod._onEncounterEnd("later");');
        L.push(cmd(0, 1, []));

        L.push(cmd(402, 0, [2, 'Abandon him']));
        say(L, 1, [
            'The boy crawls back into the dark, crying softly.',
            'You get the feeling you will never see him again.'
        ]);
        script(L, 1, 'IsaacMod._onEncounterEnd("never");');
        L.push(cmd(0, 1, []));

        L.push(cmd(404, 0, []));
        L.push(cmd(0, 0, []));
        return L;
    }

    $.state = function() {
        if (!window.$gameSystem) return null;
        var st = $gameSystem._isaacMod;
        if (!st) {
            st = $gameSystem._isaacMod = {
                steps: 0, nextOfferAt: P.steps, joined: false, refused: false, offers: 0,
                fed: false, hungerClock: 0, bodyBonus: 0, lost: null
            };
        }
        return st;
    };

    $.isInParty = function() {
        return !!($.ids.actor && $gameParty && $gameParty._actors.indexOf($.ids.actor) >= 0);
    };

    $._onEncounterStart = function() {
        $.state().offers++;
    };

    $._onEncounterEnd = function(result) {
        var st = $.state();
        if (result === 'joined') st.joined = true;
        else if (result === 'never') st.refused = true;
        else st.nextOfferAt = st.steps + P.reofferSteps;
    };

    $.canEncounter = function() {
        var st = $.state();
        if (!$._ready || !st || st.joined || st.refused) return false;
        if ($.isInParty()) {
            st.joined = true;
            return false;
        }
        // In Fear & Hunger, START turns on once the intro is over.
        if (FH.startSwitch && !$gameSwitches.value(FH.startSwitch)) return false;
        if (st.steps < st.nextOfferAt) return false;
        if ($gameParty.size() < 1 || $gameParty.size() >= P.maxParty) return false;
        if (SceneManager.isSceneChanging && SceneManager.isSceneChanging()) return false;
        if ($gameMap.isEventRunning() || $gameMessage.isBusy() || $gameTemp.isCommonEventReserved()) return false;
        if ($gamePlayer.isTransferring() || !$gamePlayer.canMove()) return false;
        return true;
    };

    $.updateEncounter = function() {
        if (P.autoEncounter && $.canEncounter()) $.encounter();
    };

    $.encounter = function() {
        if ($._ready) $gameTemp.reserveCommonEvent($.ids.ceEncounter);
    };

    $.join = function() {
        if (!$._ready) return;
        $gameParty.addActor($.ids.actor);
    };

    $.leave = function() {
        if ($._ready) $gameParty.removeActor($.ids.actor);
    };

    $.giveItems = function(bombs, pills) {
        if (!$._ready) return;
        $gameParty.gainItem($dataItems[$.ids.itemBomb], bombs === undefined ? 1 : bombs);
        $gameParty.gainItem($dataItems[$.ids.itemPill], pills === undefined ? 2 : pills);
    };

    $.reset = function() {
        if (window.$gameSystem) $gameSystem._isaacMod = null;
        $.state().steps = 0;
    };

    var _Game_Party_increaseSteps = Game_Party.prototype.increaseSteps;
    Game_Party.prototype.increaseSteps = function() {
        _Game_Party_increaseSteps.call(this);
        var st = $.state();
        if (st) st.steps++;
    };

    var _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function() {
        _Scene_Map_update.call(this);
        $.updateEncounter();
        $.updateCompanion();
        flushGabs();
    };

    var _Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;
    Game_Interpreter.prototype.pluginCommand = function(command, args) {
        _Game_Interpreter_pluginCommand.call(this, command, args);
        if (String(command).toLowerCase() !== 'isaacmod') return;
        switch (String(args[0] || '').toLowerCase()) {
        case 'encounter': $.encounter(); break;
        case 'join': $.join(); break;
        case 'leave': $.leave(); break;
        case 'items': $.giveItems(); break;
        case 'reset': $.reset(); break;
        }
    };

    //-------------------------------------------------------------------------
    // Isaac in battle
    //-------------------------------------------------------------------------

    function isIsaac(battler) {
        return !!(battler && battler.isActor && battler.isActor() && battler.actorId() === $.ids.actor);
    }

    // Unarmed Isaac attacks with his tears.
    var _Game_Actor_attackSkillId = Game_Actor.prototype.attackSkillId;
    Game_Actor.prototype.attackSkillId = function() {
        if (isIsaac(this) && $.ids.skillTears && this.hasNoWeapons()) return $.ids.skillTears;
        return _Game_Actor_attackSkillId.call(this);
    };

    // Also drives GALV_BustMenu, which shows img/pictures/Isaac_<index + 1>.
    var _Game_Actor_faceIndex = Game_Actor.prototype.faceIndex;
    Game_Actor.prototype.faceIndex = function() {
        var index = _Game_Actor_faceIndex.call(this);
        if (!P.dynamicFace || !isIsaac(this) || this.faceName() !== FACE || index !== FACES.crying) return index;
        if (this.isDead()) return FACES.dead;
        var rate = this.mhp > 0 ? this.hp / this.mhp : 1;
        if (rate <= 0.25) return FACES.wounded;
        if (rate <= 0.6) return FACES.hurt;
        return index;
    };

    var _Game_Actor_performDamage = Game_Actor.prototype.performDamage;
    Game_Actor.prototype.performDamage = function() {
        _Game_Actor_performDamage.call(this);
        if (isIsaac(this)) AudioManager.playSe(se('Isaac_Hurt', 70, 90 + Math.randomInt(20)));
    };

    var _Game_Action_testApply = Game_Action.prototype.testApply;
    Game_Action.prototype.testApply = function(target) {
        if (this.isItem() && this.item() && this.item().id === $.ids.itemPill) {
            return target.isAlive();
        }
        return _Game_Action_testApply.call(this, target);
    };

    var _Game_Action_apply = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function(target) {
        _Game_Action_apply.call(this, target);
        if (!$._ready || !this.item()) return;
        if (this.isSkill() && this.item().id === $.ids.skillBrimstone) payForBrimstone(this);
        var handler = specialHandler(this);
        if (handler && target.result().isHit()) {
            target.result().success = true;
            handler(this, target);
        }
    };

    function specialHandler(action) {
        var obj = action.item();
        if (action.isSkill() && obj.id === $.ids.skillD6) return rollD6;
        if (action.isItem() && obj.id === $.ids.itemPill) return swallowPill;
        return null;
    }

    function inBattle() {
        return $gameParty.inBattle() && BattleManager._logWindow;
    }

    function report(text) {
        if (inBattle()) {
            BattleManager._logWindow.push('addText', text);
            BattleManager._logWindow.push('wait');
        } else {
            $._messages = $._messages || [];
            $._messages.push(text);
        }
    }

    // Shows queued out-of-battle text (e.g. a pill swallowed from the menu).
    $._flushMessages = function(interpreter) {
        var lines = $._messages || [];
        $._messages = [];
        if (!lines.length) return;
        $gameMessage.setFaceImage('', 0);
        $gameMessage.setBackground(0);
        $gameMessage.setPositionType(2);
        lines.forEach(function(line) { $gameMessage.add(line); });
        if (interpreter) interpreter.setWaitMode('message');
    };

    function finishOutOfBattle() {
        if (!inBattle() && $._messages && $._messages.length && !$gameTemp.isCommonEventReserved()) {
            $gameTemp.reserveCommonEvent($.ids.ceMessage);
        }
    }

    // YEP_BattleEngineCore keeps a popup queue that its sprites create on
    // first use; make sure it exists before queueing into it.
    function popup(battler) {
        if (!battler._damagePopup && battler.clearDamagePopup) battler.clearDamagePopup();
        battler.startDamagePopup();
    }

    function hurtNonLethal(battler, rate) {
        var dmg = Math.min(battler.hp - 1, Math.ceil(battler.mhp * rate));
        if (dmg > 0) battler.gainHp(-dmg);
        return Math.max(dmg, 0);
    }

    // Brimstone tears Isaac up too: once per cast, never lethal.
    function payForBrimstone(action) {
        if (action._isaacPaid) return;
        action._isaacPaid = true;
        var user = action.subject();
        var dmg = hurtNonLethal(user, 0.15);
        if (dmg > 0) {
            report('Blood pours from ' + user.name() + '\'s eyes.');
            if ($gameParty.inBattle()) popup(user);
        }
    }

    // Heals the whole party. The action's own target shows up in the battle
    // log as usual; everyone else gets a popup.
    function healParty(target, rate) {
        $gameParty.aliveMembers().forEach(function(m) {
            if (m.hp >= m.mhp) return;
            m.gainHp(Math.ceil(m.mhp * rate));
            if (m !== target && $gameParty.inBattle()) popup(m);
        });
    }

    function roll() {
        return Math.randomInt(6) + 1;
    }

    function rollD6(action, target) {
        var user = action.subject();
        var n = roll();
        $.lastRoll = n;
        target.startAnimation($.ids.animD6[n], false, 0);
        switch (n) {
        case 1:
            report('1. The die is cursed. Blood runs from ' + user.name() + '\'s nose.');
            hurtNonLethal(target, 0.25);
            break;
        case 2:
            report('2. The die rolls away into the dark. Nothing happens.');
            break;
        case 3:
            report('3. A \\I[' + icon('pill') + ']Pill rolls out from under a stone.');
            $gameParty.gainItem($dataItems[$.ids.itemPill], 1);
            break;
        case 4:
            report('4. A faint warmth washes over the party.');
            healParty(target, 0.25);
            break;
        case 5:
            report('5. A \\I[' + icon('bomb') + ']Bomb appears in ' + user.name() + '\'s hands.');
            $gameParty.gainItem($dataItems[$.ids.itemBomb], 1);
            break;
        case 6:
            report('6! Mom\'s love, for once. Everyone\'s wounds close.');
            healParty(target, 0.6);
            break;
        }
    }

    var PILLS = [
        { name: 'Full Health', fn: function(t) { t.gainHp(t.mhp); } },
        { name: 'Health Up', fn: function(t) {
            var add = Math.max(1, Math.ceil(t.mhp * 0.05));
            t.addParam(0, add);
            if (isIsaac(t)) $.state().bodyBonus = ($.state().bodyBonus || 0) + add;
            t.gainHp(add);
        } },
        { name: 'Bad Trip', fn: function(t) { hurtNonLethal(t, 0.2); } },
        { name: 'Balls of Steel', fn: function(t) { t.addBuff(3, 5); t.addBuff(5, 5); } },
        { name: 'Speed Up', fn: function(t) { t.addBuff(6, 5); } },
        { name: 'Tears Up', fn: function(t) { t.addBuff(2, 5); t.addBuff(4, 5); } },
        { name: 'Hematemesis', fn: function(t) {
            var keep = Math.max(1, Math.ceil(t.mhp * 0.15));
            if (t.hp > keep) t.gainHp(keep - t.hp);
            t.gainMp(t.mmp);
        } },
        { name: 'I Can See Forever!', fn: function(t) { t.gainMp(Math.ceil(t.mmp * 0.5)); } },
        { name: 'Bad Gas', fn: function() {} },
        { name: 'Amnesia', fn: function() {} }
    ];
    $.PILLS = PILLS;

    function swallowPill(action, target) {
        var pill = PILLS[Math.randomInt(PILLS.length)];
        $.lastPill = pill.name;
        report(target.name() + ' swallows the pill... ' + pill.name + '!');
        pill.fn(target);
        finishOutOfBattle();
    }

    //-------------------------------------------------------------------------
    // Icons from IsaacIcons.png
    //-------------------------------------------------------------------------

    var _Window_Base_drawIcon = Window_Base.prototype.drawIcon;
    Window_Base.prototype.drawIcon = function(iconIndex, x, y) {
        if (iconIndex >= ICON_BASE && iconIndex < ICON_BASE + 64) {
            var bitmap = ImageManager.loadSystem(ICON_SHEET);
            var i = iconIndex - ICON_BASE;
            var pw = Window_Base._iconWidth;
            var ph = Window_Base._iconHeight;
            this.contents.blt(bitmap, (i % 8) * 32, Math.floor(i / 8) * 32, 32, 32, x, y, pw, ph);
            return;
        }
        _Window_Base_drawIcon.call(this, iconIndex, x, y);
    };

    $.info = function() {
        return { ids: $.ids, stats: $.stats, fh: FH, state: $.state(), ready: !!$._ready, error: $._error || null };
    };

})(IsaacMod);
