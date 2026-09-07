// ============================================================================
// src/render/icons.js — THE ICON LAYER.
//
// First unit of the src/legacy.js extraction (cleanup slice 8b: icons →
// inventory → combat → progress → refreshAll). A PURE MOVE: every function
// below arrived verbatim from legacy.js, and the only edits are the three
// forced by crossing a file boundary, each marked at its site.
//
// WHAT LIVES HERE
//   · the no-emoji backstop — itemGlyphKey / itemFallbackIcon / itemArt and the
//     monster, skill and equipment-slot twins. These ARE the rule that a
//     renderer can never draw a pictograph; ~15 files outside this one call
//     them off window.
//   · itemTintClass — the per-tier tint for ladders that share one sprite.
//   · setActivityIcon / actIconHtml — the two icon composers legacy.js used to
//     keep private.
//   · paintSkillIcons / paintMonsterIcons — the post-render DOM walkers.
//   · installIconLayer() — the LOCAL_*_ICON maps, the Hearthfire applier, the
//     generated-gear pass and the b371 icon-readiness edge.
//
// ── LOAD ORDER: THIS FILE MUST LOAD *BEFORE* src/legacy.js ─────────────────
// Every other src/render/* extraction loads AFTER legacy.js, because each is a
// screen controller that legacy.js only ever calls back into. The icon layer is
// the opposite: it is a DEPENDENCY of legacy.js's own render functions, which
// call itemArt()/skillIconHTML() as bare globals from inside the monolith. A
// classic script that runs first puts those names on window before legacy.js is
// parsed, so every one of those bare call sites resolves exactly as it did when
// the functions were declared in legacy.js itself.
//
// It is a classic script and NOT an ES module on purpose: legacy.js is a classic
// script (index.html loads it with a plain <script src>), so it cannot import.
// An ES module would also be deferred, i.e. evaluated AFTER legacy.js — the one
// ordering the icon layer cannot tolerate.
//
// ── WHAT IS *NOT* A PURE MOVE (three sites, all forced, all marked) ────────
//   1. itemGlyphKey's `ITEMS` read became `window.ITEMS`. Inside legacy.js the
//      bare name resolved to the script-scope `const ITEMS`; main.js's
//      unifyObject() merges the ESM table into that same object, so the two are
//      one identity by the time any renderer runs.
//   2. installIconLayer() takes `getActiveTab` instead of reading legacy's
//      script-scope `let activeTab` — a `let` is not a window property.
//   3. block 38's self-running IIFE became a named function. legacy.js calls it
//      at the exact line block 38 used to occupy, so the DOMContentLoaded arm,
//      the generated-gear pass and the readiness edge are installed at the same
//      instant of the boot as before. tests/icon-boot-order.mjs is the guard.
// ============================================================================

(function(){
"use strict";

/* ── the tint half of the icon layer ─────────────────────────────────── */
/* ─── b217: material tinting ───────────────────────────────────────────────
 * Several progression ladders share one sprite because the icon pack only
 * ships one (all wood is one log; all wood is one plank). Rendering the same
 * image for five tiers makes a ladder look unfinished — the player levels up
 * and nothing changes.
 *
 * Rather than buy or fake five sprites, tint the shared one. Wood genuinely
 * differs by species — pale sapwood, dark oak, grey willow, red maple, deep
 * yew — so a hue/saturation shift is honest material colour, not decoration.
 * Items that HAVE their own art get no class and render untouched.
 *
 * Returns a class name for <img>; the .tint-* rules live in art-direction.css.
 */
function itemTintClass(id) {
  if (!id) return '';
  if (/^oak_(log|plank)$/.test(id)) return 'tint-oak';
  if (/^duskwood_(log|plank)$/.test(id)) return 'tint-dusk';
  if (/^willow_(log|plank)$/.test(id)) return 'tint-willow';
  if (/^maple_(log|plank)$/.test(id)) return 'tint-maple';
  if (/^yew_(log|plank)$/.test(id)) return 'tint-yew';
  if (/^runewood_(log|plank)$/.test(id)) return 'tint-rune';
  return '';
}

/* ── the no-emoji backstop ───────────────────────────────────────────── */
/* ─── b217: the no-emoji backstop ──────────────────────────────────────────
 * ~1,400 emoji live in the DATA tables as `icon:` fallbacks, and every item
 * renderer fell through to them when no painted art was mapped. Deleting the
 * data fields would leave blanks; the durable fix is to make the RENDERERS
 * incapable of drawing an emoji, so no future data entry can leak one onto the
 * screen either.
 *
 * The fallback picks a gilt glyph from the shipped icon set by inspecting what
 * the item IS (weapon / armour / food / seed / bone / ore / log …), which
 * gives a category-correct icon in the game's own style. Only if the atlas has
 * nothing does it fall back to a plain gilt disc — deliberate-looking, never
 * a system pictograph. */
/* 2026-08-23 — WIDENED, because "not an emoji" was only half the job.
   A live boot showed FORTY-NINE unmapped ids landing on the `uiChest` default,
   and the Inventory screenshot is what that costs: a bag whose bottom four
   rows are the SAME chest repeated, which reads as "unfinished asset pipeline"
   just as loudly as an emoji does. Every rule added below was derived from that
   list of 49 — no speculative patterns.
   Order matters: the `def` tests are facts the data states outright, the id
   patterns underneath are inference and only run when the data is silent.
   `uiChest` is now a genuine last resort rather than the common case. */
function itemGlyphKey(id, def){
  def = def || (window.ITEMS && window.ITEMS[id]) || null;
  if(def){
    if(def.type === 'weapon')    return 'uiSword';
    if(def.type === 'armor')     return 'uiBody';
    if(def.type === 'jewelry')   return 'uiAmulet';
    if(def.type === 'companion') return 'uiPaw';
    if(def.type === 'ammo')      return 'uiArrow';
    if(def.heals)   return 'uiFood';
    if(def.seed)    return 'uiSeed';
    if(def.buryXp)  return 'uiBone';
    if(def.recipe)  return 'uiScroll';
    /* the enchant/rune family states its own element; `tag:'rune'` and the
       `rune_of_*` ids both land here rather than on a chest — the defect the
       Runecrafting report filed (a CHEST beside two painted rune-stones). */
    if(def.tag === 'rune' || def.element) return 'runecrafting';
    if(def.slot)    return 'uiBody';
  }
  var s = String(id || '');
  /* b225: burnt food is carbon, not a chest — and the flame reads as "the fire
     got this one". Prefix-matched so per-food burnt variants would inherit it. */
  if(/^burnt_/.test(s))                   return 'uiFlame';
  if(/_log$|_plank$|wood/.test(s))        return 'uiLog';
  if(/_ore$|_bar$|coal|stone|ingot/.test(s)) return 'uiOre';
  if(/seed/.test(s))                      return 'uiSeed';
  if(/bone/.test(s))                      return 'uiBone';
  if(/potion|brew|draught/.test(s))       return 'uiPotion';
  if(/gem|ruby|sapphire|emerald|diamond/.test(s)) return 'uiGem';
  if(/fish|shrimp|trout|lobster|shark/.test(s))   return 'uiFish';
  if(/token/.test(s))                     return 'token';
  /* ── the 49, grouped ───────────────────────────────────────────────────── */
  if(/rune/.test(s))                      return 'runecrafting';
  if(/blueprint|_deed$|scroll|tome|codex|manual/.test(s)) return 'uiScroll';
  if(/^.*_key$|^key_|sigil|seal$|_seal_/.test(s))         return 'uiKey';
  if(/fang|claw|tooth|tusk|horn|scale|chitin|shell/.test(s)) return 'uiBone';
  if(/pelt|hide|leather|fur|veil|cloth|silk|thread|wool/.test(s)) return 'uiCape';
  if(/ichor|sac|venom|essence|dust|ash|blood|heart|eye/.test(s)) return 'uiPotion';
  if(/meat|steak|ration|bread|pie|stew|soup|cake/.test(s)) return 'uiFood';
  if(/medal|badge|trophy|crown|relic|totem|standard|banner/.test(s)) return 'uiMedal';
  if(/arrow|bolt|dart|quiver/.test(s))    return 'uiArrow';
  if(/herb|leaf|root|flower|bloom/.test(s)) return 'uiHerb';
  if(/egg/.test(s))                       return 'uiEgg';
  if(/steel|plate|ember|frag/.test(s))    return 'uiOre';
  return 'uiChest';
}
/* ── WHY THESE CALLS GO THROUGH `window` AND NOT THE LOCAL BINDING ─────────
   In legacy.js every one of these helpers was a script-scope `function`
   declaration, which in a classic script IS a property of the global object.
   A bare `itemGlyphKey(...)` inside itemFallbackIcon therefore resolved
   through the scope chain to `window.itemGlyphKey` — and two feature modules
   REPLACE that property after legacy.js loads: muster.js wraps it for
   `muster_seal`, clan-seat-ui.js for the four castle goods. The wrappers are
   additive and delegate to the previous function, so the chain worked.

   Inside this file the same helpers are closure-locals of the module IIFE, so
   a bare call would bind to the local declaration and silently bypass both
   wrappers. Measured, not assumed: tools/js-ab-icon-diff.mjs reported exactly
   three ids drawing a different glyph than main — iron_fitting, timber_beam
   and muster_seal, i.e. the wrapped ones. Going through `window` restores the
   original resolution and keeps the wrap-point a wrap-point. */
function itemFallbackIcon(id, px, def){
  var g = (window.HR && window.HR.icon)
    ? window.HR.icon(window.itemGlyphKey(id, def), px || 28, 'var(--ink-3)')
    : null;
  return g || '<span class="hr-blank-icon" aria-hidden="true"></span>';
}
/* EXPLICIT exports. These two ARE the no-emoji backstop, and renderers outside
   this file (dungeons.js, market.js, item-ux.js, collection-log.js, the render/
   modules) are exactly the ones that were still falling through to `it.icon`.
   Relying on "a top-level function declaration lands on window" is the
   cross-IIFE trap this file has already been bitten by four times (b127, b130,
   b224, b366) — every one of them silent. */

/* ─── THE SAME BACKSTOP FOR THE OTHER THREE SUBJECT KINDS ──────────────────
 * b217 built the ITEM backstop and it has held. Monsters, skills and equipment
 * slots never got one, so ~40 render sites across nine files still ended in
 * `|| m.icon` / `|| s.icon` / `|| meta.icon` — i.e. in the data file's emoji.
 * Most are cold paths (an unmapped monster, a skill with no medallion, a slot
 * meta), which is exactly why they survived four emoji purges: they are
 * invisible until the day a content row lands without art, and then a
 * pictograph appears on the combat screen.
 *
 * The rule is the same one that worked for items: make the RENDERER incapable
 * of drawing a pictograph. Every helper below returns painted art, else a
 * shipped glyph, else an empty deliberate blank — never a character. */

/* MONSTER — painted portrait ▸ gilt creature medallion ▸ a red-ringed skull.
 * The skull is honest: it says "a foe" without pretending to be a species. */
function monsterFallbackIcon(id, px){
  var IS = window.HearthriseIconSet;
  if(IS && IS.medallionMon){
    var med = IS.medallionMon(id, px || 34);
    if(med) return med;
  }
  var g = (window.HR && window.HR.icon) ? window.HR.icon('uiSkull', Math.round((px||34)*0.7), '--red') : null;
  return g || '<span class="hr-blank-icon" aria-hidden="true"></span>';
}
function monsterArt(id, px){
  var p = window._monsterIcon && window._monsterIcon[id];
  if(p) return '<img src="'+p+'" class="hr-mon-art" alt="" loading="lazy" draggable="false" />';
  return window.monsterFallbackIcon(id, px);   /* via window: see the note on itemFallbackIcon */
}

/* SKILL — the struck medallion the skills rail already uses, so a skill looks
 * the same on the rail, the character sheet, the activity bar and a level-up
 * toast. `uiStar` covers a skill id with no baked glyph (there were two:
 * runecrafting and stonemason, now drawn in src/data/glyphs-extra.js). */
function skillIconHTML(id, px){
  var IS = window.HearthriseIconSet;
  if(IS && IS.medallion){
    var med = IS.medallion(id, px || 34);
    if(med) return med;
  }
  var g = (window.HR && window.HR.icon) ? window.HR.icon('uiStar', Math.round((px||34)*0.7), '--gold-2') : null;
  return g || '<span class="hr-blank-icon" aria-hidden="true"></span>';
}

/* EQUIPMENT SLOT — the line-glyph set defined in block 24 (slotGlyphSVG) is
 * the ONE empty-slot vocabulary; `EQUIP_SLOT_META[slot].icon` is a raw emoji
 * and must never reach a screen. */
function slotIconHTML(slot){
  return (typeof window.slotGlyphSVG === 'function') ? window.slotGlyphSVG(slot) : '';
}

/* Top-level item art. Two `itemImg` helpers already exist but both live inside
 * IIFEs, so the monolith's own render functions (shop rows, farm rows) could
 * not reach them and fell back to the emoji in the data. */
function itemArt(id, px){
  var path = window._itemPath && window._itemPath[id];
  if(path){
    var tint = (typeof window.itemTintClass === 'function') ? window.itemTintClass(id) : '';
    return '<img src="'+path+'" class="hr-item-art '+tint+'" alt="" loading="lazy" draggable="false" />';
  }
  return window.itemFallbackIcon(id, px || 26);   /* via window: see the note on itemFallbackIcon */
}

/* b217: the activity bar's icon slot took a raw emoji (💤 when idle, the
 * monster's or skill's emoji when busy) and sits under the topbar on every
 * screen — the single most-seen pictograph in the build. This paints a gilt
 * glyph instead, falling back to nothing rather than to an emoji. */
function setActivityIcon(el, glyphKey, color){
  if(!el) return;
  var g = (window.HR && window.HR.icon) ? window.HR.icon(glyphKey, 18, color || 'currentColor') : null;
  el.innerHTML = g || '';
}

/* `fallbackSkillId` (was `fallbackEmoji`, and the callers really were passing
   `action.icon` — the node's emoji — into it). Nothing here has drawn that
   emoji since b217, but a parameter NAMED fallbackEmoji is an invitation, and
   the ESM twin in features/activities-grid.js was still honouring it. */
function actIconHtml(prod, fallbackSkillId){
  var path = prod && window._itemPath && window._itemPath[prod];
  if(path){
    /* b217: tier tint (window.itemTintClass) so ladders that share one sprite
       still read as distinct materials. This is the live copy — the ESM
       renderer in features/activities-grid.js has the same helper, but this
       one is what actually paints the Skills screen. */
    var tint = (typeof window.itemTintClass === 'function') ? window.itemTintClass(prod) : '';
    return '<img src="'+path+'" class="'+tint+'" alt="" loading="lazy" draggable="false" />';
  }
  /* via window: see the note on itemFallbackIcon */
  if(prod) return '<span class="at-emoji">'+window.itemFallbackIcon(prod, 34)+'</span>';
  return '<span class="at-emoji">'+window.skillIconHTML(fallbackSkillId, 34)+'</span>';
}

/* ── post-render DOM walkers ─────────────────────────────────────────── */
/* ─── DOM walkers — replace emoji with <img> after each render ─── */
function paintSkillIcons(){
  document.querySelectorAll('.skill-tile, .skill-card').forEach(function(el){
    var oc = el.getAttribute('onclick') || '';
    var m = oc.match(/openSkillDetail\('([^']+)'\)/) || oc.match(/showSkill\('([^']+)'\)/);
    if(!m) return;
    var sk = m[1];
    var path = window._skillIcon[sk];
    if(!path) return;
    var iconEl = el.querySelector('.sicon, .icon');
    if(!iconEl) return;
    if(iconEl.querySelector('.poneti-skill-img')) return;
    iconEl.innerHTML = '<img src="' + path + '" class="poneti-skill-img" alt="" loading="lazy" />';
  });
}
function paintMonsterIcons(){
  document.querySelectorAll('.monster-row').forEach(function(el){
    /* b341: the row's id moved from an inline onclick to `data-monster` when
       row clicks became delegated. This reader is a HIDDEN DEPENDENCY on that
       attribute — it has no name fallback, so missing it here would have
       silently stopped every painted monster portrait rather than throwing.
       The onclick match stays as the fallback for any row still authored the
       old way (the skills panel reuses this class with inline handlers). */
    var id = el.getAttribute('data-monster');
    if(!id){
      var oc = el.getAttribute('onclick') || '';
      var m = oc.match(/startCombat\('([^']+)'\)/) || oc.match(/openMonster\('([^']+)'\)/);
      if(!m) return;
      id = m[1];
    }
    var path = window._monsterIcon[id];
    if(!path) return;
    var iconEl = el.querySelector('.mi');
    if(!iconEl) return;
    if(iconEl.querySelector('.poneti-mon-img')) return;
    iconEl.innerHTML = '<img src="' + path + '" class="poneti-mon-img" alt="" loading="lazy" />';
  });
}

/* ── the local icon maps, the appliers and the readiness edge ────────── */
function installIconLayer(deps){
  /* `activeTab` is a script-scope `let` in legacy.js, therefore NOT a window
     property and not reachable from this file. The caller closes over it. */
  var getActiveTab = (deps && deps.getActiveTab) || function(){ return null; };

var BUNDLE_SKILL_ICON = {
  "attack": "assets/raw-bundle/sword-rpg-icons/shadow/1.png",
  "bountyHunter": "assets/raw-bundle/weapon-achievement-vector-rpg-icons/1.png",
  "cooking": "assets/raw-bundle/rpg-medieval-food-icons/background/5.png",
  "crafting": "assets/raw-bundle/crafting-material-vector-icons/shadow/1.png",
  "defense": "assets/raw-bundle/50-shields-rpg-icon-pack/background/1.png",
  "farming": "assets/raw-bundle/48-rpg-farming-game-icons/shadow/5.png",
  "fishing": "assets/raw-bundle/rpg-fishing-game-icons/shadow/1.png",
  "hitpoints": "assets/raw-bundle/48-magic-potion-rpg-icons/shadow/5.png",
  "magic": "assets/raw-bundle/50-rpg-staff-icons/background/1.png",
  "mining": "assets/raw-bundle/48-mining-rpg-icons/shadow/1.png",
  "prayer": "assets/raw-bundle/48-scroll-rpg-icons/shadow/5.png",
  "ranged": "assets/raw-bundle/bow-and-crossbow-vector-icons/shadow/1.png",
  "smithing": "assets/raw-bundle/48-mineral-rpg-icons/shadow/1.png",
  "strength": "assets/raw-bundle/50-rpg-axe-icons/background/1.png",
  "woodcutting": "assets/raw-bundle/50-rpg-axe-icons/background/8.png",
};
// ── Bundle icon maps (audited & remapped May 2026) ─────────────
// Visual audit performed by walking every relevant pack via
// assets/icon-audit.html. Notes on weak/placeholder mappings live
// inline; a complete missing-asset shopping list is at the bottom
// of this block in the BUNDLE_ICON_GAPS comment. Until those packs
// are purchased, we route those items to the closest thematic
// substitute (marked with a /* PLACEHOLDER */ comment).
var BUNDLE_ITEM_ICON  = {
  "alpha_cloak": "assets/raw-bundle/trousers-rpg-icon-pack/shadow/45.png",
  "alpha_fang": "assets/raw-bundle/claw-loot-vector-game-icons/shadow/45.png",
  "ancient_claw": "assets/raw-bundle/claw-loot-vector-game-icons/shadow/48.png",
  "ancient_fragment": "assets/raw-bundle/earthly-loot-rpg-icon-pack/shadow/10.png",
  "ancient_rune": "assets/raw-bundle/48-magic-rune-rpg-icons-pack/runes+bricks/shadow/30.png",
  "apprentice_staff": "assets/raw-bundle/50-rpg-staff-icons/background/5.png",
  "bat_wing": "assets/raw-bundle/fairy-loot-game-icons/shadow/15.png",
  "bear_claw": "assets/raw-bundle/claw-loot-vector-game-icons/shadow/38.png",
  "bear_pelt": "assets/raw-bundle/claw-loot-vector-game-icons/shadow/32.png",
  // Bones — was pointing at skull icons. Reassigned to actual bone visuals.
  "big_bones": "assets/raw-bundle/skull-and-bone-rpg-icons/shadow/14.png",     // bone pile
  "bone_chips": "assets/raw-bundle/skull-and-bone-rpg-icons/shadow/15.png",    // single bone
  "bones": "assets/raw-bundle/skull-and-bone-rpg-icons/shadow/13.png",         // crossed femurs
  "bronze_belt": "assets/raw-bundle/belt-game-icons/shadow/2.png",
  "bronze_sword": "assets/raw-bundle/sword-rpg-icons/shadow/3.png",
  "brute_plate": "assets/raw-bundle/battle-loot-vector-rpg-icons/shadow/30.png",
  "captain_medal": "assets/raw-bundle/weapon-achievement-vector-rpg-icons/28.png",
  "captains_ribblade": "assets/raw-bundle/sword-rpg-icons/shadow/48.png",
  "carrot": "assets/raw-bundle/rpg-vegetable-game-icons/background/12.png",
  "carrot_seed": "assets/raw-bundle/berries-and-seeds-icons/background/12.png",
  "chief_blade": "assets/raw-bundle/sword-rpg-icons/shadow/42.png",
  "coal": "assets/raw-bundle/48-mineral-rpg-icons/shadow/22.png",
  "copper_ore": "assets/raw-bundle/48-mineral-rpg-icons/shadow/5.png",
  "copper_ring": "assets/raw-bundle/rings-and-jewelry-game-icons/shadow/3.png",
  "cracked_spellstone": "assets/raw-bundle/48-magic-artifact-rpg-icons/shadow/8.png",
  "dark_sigil": "assets/raw-bundle/rpg-undead-loot-icons/background/35.png",
  "death_steel": "assets/raw-bundle/48-mineral-rpg-icons/shadow/40.png",
  "demon_shard": "assets/raw-bundle/battle-loot-vector-rpg-icons/shadow/12.png",
  "dire_fang": "assets/raw-bundle/claw-loot-vector-game-icons/shadow/28.png",
  "dragon_bones": "assets/raw-bundle/skull-and-bone-rpg-icons/shadow/48.png",
  "dragon_gem": "assets/raw-bundle/rpg-gems-vector-icons/shadow/35.png",
  "dragon_scale": "assets/raw-bundle/dragon-loot-vector-rpg-icons/shadow/18.png",
  "fox_companion": "assets/raw-bundle/monster-rpg-256x256-icons/shadow/18.png",
  "goblin_ear": "assets/raw-bundle/rpg-kobold-loot-icons/background/10.png",
  "goblin_totem": "assets/raw-bundle/rpg-kobold-loot-icons/background/30.png",
  "gold_ore": "assets/raw-bundle/48-mineral-rpg-icons/shadow/32.png",
  "grave_dust": "assets/raw-bundle/rpg-undead-loot-icons/background/12.png",
  "hell_ember": "assets/raw-bundle/48-magic-artifact-rpg-icons/shadow/35.png",
  "hollow_sigil": "assets/raw-bundle/rpg-undead-loot-icons/background/48.png",
  "hunter_necklace": "assets/raw-bundle/rings-and-jewelry-game-icons/shadow/25.png",
  "iron_arrows": "assets/raw-bundle/bow-and-crossbow-vector-icons/shadow/48.png",
  "iron_helm": "assets/raw-bundle/rpg-helmet-icons/background/8.png",
  "iron_ore": "assets/raw-bundle/48-mineral-rpg-icons/shadow/12.png",
  "iron_platebody": "assets/raw-bundle/50-rpg-armor-icons/background/10.png",
  "iron_sword": "assets/raw-bundle/sword-rpg-icons/shadow/12.png",
  "iron_warhammer": "assets/raw-bundle/mace-rpg-game-icons/shadow/18.png",
  "leather_boots": "assets/raw-bundle/trousers-rpg-icon-pack/shadow/3.png",
  "leather_gloves": "assets/raw-bundle/50-rpg-glove-icons/background/4.png",
  "lich_soul": "assets/raw-bundle/rpg-undead-loot-icons/background/25.png",
  "lobster": "assets/raw-bundle/rpg-fishing-game-icons/shadow/32.png",
  "longbow": "assets/raw-bundle/bow-and-crossbow-vector-icons/shadow/22.png",
  "magic_essence": "assets/raw-bundle/48-magic-rune-rpg-icons-pack/bricks/shadow/5.png",
  // ── Logs ──
  // earthly-loot-rpg-icon-pack/shadow/17 is the only actual cut-log icon
  // in the entire 92-pack bundle (rings visible on a tree-section).
  // We use it for normal_log and tint-shift via re-using twig/branch
  // variants for the higher-tier woods. Still a partial PLACEHOLDER —
  // see ICON_GAPS.md for the dedicated log pack we should buy.
  "normal_log":  "assets/raw-bundle/earthly-loot-rpg-icon-pack/shadow/17.png",  /* PARTIAL — actual log */
  "oak_log":     "assets/raw-bundle/earthly-loot-rpg-icon-pack/shadow/16.png",  /* PLACEHOLDER — twig bundle */
  "willow_log":  "assets/raw-bundle/earthly-loot-rpg-icon-pack/shadow/14.png",  /* PLACEHOLDER — dark stick */
  "maple_log":   "assets/raw-bundle/earthly-loot-rpg-icon-pack/shadow/47.png",  /* PLACEHOLDER — sheaf */
  "yew_log":     "assets/raw-bundle/earthly-loot-rpg-icon-pack/shadow/35.png",  /* PLACEHOLDER — grain */

  "mithril_ore": "assets/raw-bundle/48-mineral-rpg-icons/shadow/42.png",
  "night_fang": "assets/raw-bundle/claw-loot-vector-game-icons/shadow/40.png",
  "oak_staff": "assets/raw-bundle/50-rpg-staff-icons/background/18.png",
  "plague_ichor": "assets/raw-bundle/48-magic-potion-rpg-icons/shadow/18.png",
  "potato": "assets/raw-bundle/rpg-vegetable-game-icons/background/28.png",
  "potato_seed": "assets/raw-bundle/berries-and-seeds-icons/background/28.png",
  "pumpkin": "assets/raw-bundle/rpg-vegetable-game-icons/background/48.png",
  "pumpkin_seed": "assets/raw-bundle/berries-and-seeds-icons/background/44.png",
  "rat_tail": "assets/raw-bundle/claw-loot-vector-game-icons/shadow/35.png",
  "razor_claw": "assets/raw-bundle/claw-loot-vector-game-icons/shadow/48.png",
  "ruby": "assets/raw-bundle/rpg-gems-vector-icons/shadow/8.png",
  "rune_frag": "assets/raw-bundle/48-magic-rune-rpg-icons-pack/bricks/shadow/25.png",
  "rune_sword": "assets/raw-bundle/sword-rpg-icons/shadow/35.png",
  "shadow_pelt": "assets/raw-bundle/claw-loot-vector-game-icons/shadow/42.png",
  "shadow_thread": "assets/raw-bundle/rpg-spider-loot-icons/background/38.png",
  "shark": "assets/raw-bundle/rpg-fishing-game-icons/shadow/48.png",
  "shortbow": "assets/raw-bundle/bow-and-crossbow-vector-icons/shadow/3.png",
  "shrimp": "assets/raw-bundle/rpg-fishing-game-icons/shadow/5.png",
  "silk_thread": "assets/raw-bundle/rpg-spider-loot-icons/background/21.png",
  "slime_gel": "assets/raw-bundle/fairy-loot-game-icons/shadow/8.png",
  "small_fang": "assets/raw-bundle/claw-loot-vector-game-icons/shadow/12.png",
  "spider_eye": "assets/raw-bundle/rpg-spider-loot-icons/background/28.png",
  "steel_helm": "assets/raw-bundle/rpg-helmet-icons/background/22.png",
  "steel_platebody": "assets/raw-bundle/50-rpg-armor-icons/background/25.png",
  "steel_sword": "assets/raw-bundle/sword-rpg-icons/shadow/25.png",
  "sticky_core": "assets/raw-bundle/fairy-loot-game-icons/shadow/22.png",
  "stone_maul": "assets/raw-bundle/mace-rpg-game-icons/shadow/6.png",
  "swarm_heart": "assets/raw-bundle/48-magic-artifact-rpg-icons/shadow/25.png",
  "tomato": "assets/raw-bundle/rpg-vegetable-game-icons/background/38.png",
  "tomato_seed": "assets/raw-bundle/berries-and-seeds-icons/background/36.png",
  "traveler_cape": "assets/raw-bundle/trousers-rpg-icon-pack/shadow/30.png",
  "troll_hide": "assets/raw-bundle/claw-loot-vector-game-icons/shadow/20.png",
  "trout": "assets/raw-bundle/rpg-fishing-game-icons/shadow/18.png",
  "turnip": "assets/raw-bundle/rpg-vegetable-game-icons/background/3.png",
  "turnip_seed": "assets/raw-bundle/berries-and-seeds-icons/background/5.png",
  "vamp_dust": "assets/raw-bundle/rpg-undead-loot-icons/background/8.png",
  "venom_sac": "assets/raw-bundle/rpg-spider-loot-icons/background/11.png",
  "void_chitin": "assets/raw-bundle/rpg-spider-loot-icons/background/45.png",
  "void_core": "assets/raw-bundle/48-magic-artifact-rpg-icons/shadow/45.png",
  "war_crown": "assets/raw-bundle/weapon-achievement-vector-rpg-icons/30.png",
  "warlord_badge": "assets/raw-bundle/weapon-achievement-vector-rpg-icons/18.png",
  "wheat": "assets/raw-bundle/48-rpg-farming-game-icons/shadow/22.png",
  "wheat_seed": "assets/raw-bundle/berries-and-seeds-icons/background/20.png",
  "wolf_pelt": "assets/raw-bundle/claw-loot-vector-game-icons/shadow/5.png",
  "wraith_veil": "assets/raw-bundle/rpg-undead-loot-icons/background/42.png",

  // ─── Bind-on-Pickup dungeon keys ───
  // The mining pack actually has good key icons at slots 44 (gold key)
  // and 45 (lock-and-key). For the rest we use scroll-pack tomes since
  // there's no dedicated key pack large enough to cover six unique keys.
  "bone_key":        "assets/raw-bundle/48-mining-rpg-icons/shadow/44.png",     /* literal key */
  "goblin_seal":     "assets/raw-bundle/48-mining-rpg-icons/shadow/45.png",     /* lock+key */
  "arcane_tome":     "assets/raw-bundle/magic-book-game-icons/shadow/29.png",   /* purple tome */
  "obsidian_sigil":  "assets/raw-bundle/48-magic-artifact-rpg-icons/shadow/40.png", /* dark sigil */
  "void_fragment":   "assets/raw-bundle/48-magic-artifact-rpg-icons/shadow/42.png", /* purple fragment */
  "dragonsbane_key": "assets/raw-bundle/48-magic-artifact-rpg-icons/shadow/44.png", /* legendary artifact */

  // ─── Bind-on-Pickup housing blueprints ───
  // Magic-book pack has 48 distinct tome icons — perfect for blueprints.
  "kitchen_blueprint_t2": "assets/raw-bundle/magic-book-game-icons/shadow/5.png",
  "kitchen_blueprint_t3": "assets/raw-bundle/magic-book-game-icons/shadow/18.png",
  "forge_blueprint_t2":   "assets/raw-bundle/magic-book-game-icons/shadow/7.png",
  "forge_blueprint_t3":   "assets/raw-bundle/magic-book-game-icons/shadow/27.png",
  "library_blueprint_t2": "assets/raw-bundle/magic-book-game-icons/shadow/14.png",
  "library_blueprint_t3": "assets/raw-bundle/magic-book-game-icons/shadow/30.png",
  "trophy_blueprint_t2":  "assets/raw-bundle/magic-book-game-icons/shadow/32.png",
  "trophy_blueprint_t3":  "assets/raw-bundle/magic-book-game-icons/shadow/47.png",

  // ─── Bind-on-Pickup raid currencies ───
  "dragon_relic":  "assets/raw-bundle/dragon-loot-vector-rpg-icons/shadow/30.png",
  "void_essence":  "assets/raw-bundle/48-magic-artifact-rpg-icons/shadow/30.png",
  "hearth_token":  "assets/raw-bundle/weapon-achievement-vector-rpg-icons/12.png",  /* medal */

  // ─── Cooking outputs ───
  // The current ITEMS table defines cooked food. Map them to the medieval
  // food pack which has 50 plated/cooked food icons.
  "cooked_shrimp":  "assets/raw-bundle/rpg-medieval-food-icons/background/8.png",
  "cooked_trout":   "assets/raw-bundle/rpg-medieval-food-icons/background/14.png",
  "cooked_lobster": "assets/raw-bundle/rpg-medieval-food-icons/background/22.png",
  "cooked_shark":   "assets/raw-bundle/rpg-medieval-food-icons/background/35.png",
  "wheat_bread":    "assets/raw-bundle/rpg-medieval-food-icons/background/3.png",
  "tomato_soup":    "assets/raw-bundle/rpg-medieval-food-icons/background/19.png",
  "roasted_pumpkin":"assets/raw-bundle/rpg-medieval-food-icons/background/27.png",
  "vegetable_stew": "assets/raw-bundle/rpg-medieval-food-icons/background/30.png",
  "baked_potato":   "assets/raw-bundle/rpg-medieval-food-icons/background/26.png",
  "pumpkin_pie":    "assets/raw-bundle/rpg-medieval-food-icons/background/40.png",
  "carrot_stew":    "assets/raw-bundle/rpg-medieval-food-icons/background/32.png",
  "bear_claw_pie":  "assets/raw-bundle/rpg-medieval-food-icons/background/41.png",
  "hunters_feast":  "assets/raw-bundle/rpg-medieval-food-icons/background/45.png",
  "dragon_stew":    "assets/raw-bundle/rpg-medieval-food-icons/background/48.png",
  "lich_soul_soup": "assets/raw-bundle/rpg-medieval-food-icons/background/49.png",
  "void_banquet":   "assets/raw-bundle/rpg-medieval-food-icons/background/50.png",

  // ─── Bars + planks ───
  "bronze_bar":   "assets/raw-bundle/48-mineral-rpg-icons/shadow/3.png",
  "iron_bar":     "assets/raw-bundle/48-mineral-rpg-icons/shadow/19.png",
  "steel_bar":    "assets/raw-bundle/48-mineral-rpg-icons/shadow/29.png",
  "gold_bar":     "assets/raw-bundle/48-mineral-rpg-icons/shadow/11.png",
  "mithril_bar":  "assets/raw-bundle/48-mineral-rpg-icons/shadow/25.png",
  "rune_bar":     "assets/raw-bundle/48-mineral-rpg-icons/shadow/38.png",
  // Planks: same gap as logs — no dedicated plank pack. Earthly-loot
  // textures used as placeholders.
  "normal_plank": "assets/raw-bundle/earthly-loot-rpg-icon-pack/shadow/3.png",   /* PLACEHOLDER */
  "oak_plank":    "assets/raw-bundle/earthly-loot-rpg-icon-pack/shadow/9.png",   /* PLACEHOLDER */
  "willow_plank": "assets/raw-bundle/earthly-loot-rpg-icon-pack/shadow/15.png",  /* PLACEHOLDER */
  "maple_plank":  "assets/raw-bundle/earthly-loot-rpg-icon-pack/shadow/21.png",  /* PLACEHOLDER */
  "yew_plank":    "assets/raw-bundle/earthly-loot-rpg-icon-pack/shadow/27.png",  /* PLACEHOLDER */
};
// Monster icon mapping (audited May 2026). The monster-rpg-256x256-icons
// pack only contains 48 distinct creatures, several of which are
// mushroom/plant variants — not enough variety to give every Hearthrise
// foe a perfectly thematic match. This remap maximises uniqueness using
// the closest available icons. Items marked /* THEME-MISMATCH */ are
// playable but warrant a future icon-pack purchase to upgrade.
var BUNDLE_MONSTER_ICON = {
  // Tier 1 — local threats
  "slime":          "assets/raw-bundle/monster-rpg-256x256-icons/shadow/19.png", // pink slime
  "rat":            "assets/raw-bundle/monster-rpg-256x256-icons/shadow/13.png", // gray rat
  "goblin":         "assets/raw-bundle/monster-rpg-256x256-icons/shadow/15.png", // red gnome
  "weak_skeleton":  "assets/raw-bundle/monster-rpg-256x256-icons/shadow/37.png", // ghost (no skeleton in pack) /* THEME-MISMATCH */
  "small_wolf":     "assets/raw-bundle/monster-rpg-256x256-icons/shadow/16.png", // brown beast

  // Tier 2 — wilderness threats
  "giant_bat":      "assets/raw-bundle/monster-rpg-256x256-icons/shadow/22.png", // bat
  "hobgoblin":      "assets/raw-bundle/monster-rpg-256x256-icons/shadow/4.png",  // red goblin
  "wolf":           "assets/raw-bundle/monster-rpg-256x256-icons/shadow/24.png", // bear-like beast
  "skeleton":       "assets/raw-bundle/monster-rpg-256x256-icons/shadow/32.png", // green spirit /* THEME-MISMATCH (no skeleton art) */
  "dark_wizard":    "assets/raw-bundle/monster-rpg-256x256-icons/shadow/12.png", // owl-mage

  // Tier 3 — dangerous creatures
  "venom_spider":   "assets/raw-bundle/spider-vector-icons/shadow/5.png",        // dedicated spider pack
  "goblin_brute":   "assets/raw-bundle/monster-rpg-256x256-icons/shadow/17.png", // yellow demon
  "dire_wolf":      "assets/raw-bundle/monster-rpg-256x256-icons/shadow/28.png", // gray boar (closest beast)  /* THEME-MISMATCH */
  "zombie":         "assets/raw-bundle/monster-rpg-256x256-icons/shadow/18.png", // green wraith
  "warlock":        "assets/raw-bundle/monster-rpg-256x256-icons/shadow/30.png", // red sorcerer

  // Tier 4 — elite monsters
  "plague_swarm":   "assets/raw-bundle/monster-rpg-256x256-icons/shadow/39.png", // yellow scorpion
  "goblin_warlord": "assets/raw-bundle/monster-rpg-256x256-icons/shadow/25.png", // red devil
  "bear":           "assets/raw-bundle/monster-rpg-256x256-icons/shadow/24.png", // small bear  (NOTE: shares with wolf; bear is canonical)
  "wraith":         "assets/raw-bundle/monster-rpg-256x256-icons/shadow/1.png",  // brown wraith
  "lesser_demon":   "assets/raw-bundle/monster-rpg-256x256-icons/shadow/2.png",  // red mushroom-demon
  "mountain_troll": "assets/raw-bundle/monster-rpg-256x256-icons/shadow/5.png",  // brown ent

  // Tier 5 — mythic threats
  "shadow_creeper": "assets/raw-bundle/monster-rpg-256x256-icons/shadow/27.png", // spider
  "warband_captain":"assets/raw-bundle/monster-rpg-256x256-icons/shadow/26.png", // armored warrior
  "panther":        "assets/raw-bundle/monster-rpg-256x256-icons/shadow/16.png", // brown beast (no panther) /* THEME-MISMATCH */
  "death_knight":   "assets/raw-bundle/monster-rpg-256x256-icons/shadow/14.png", // pumpkin-knight
  "archmage":       "assets/raw-bundle/monster-rpg-256x256-icons/shadow/35.png", // green ent-mage

  // Tier 6 — legendary
  "void_parasite":  "assets/raw-bundle/monster-rpg-256x256-icons/shadow/9.png",  // worm/snail
  "war_king":       "assets/raw-bundle/monster-rpg-256x256-icons/shadow/4.png",  // shares hobgoblin /* THEME-MISMATCH */
  "ancient_bear":   "assets/raw-bundle/monster-rpg-256x256-icons/shadow/8.png",  // pink mushroom — large beast slot /* THEME-MISMATCH */
  "lich":           "assets/raw-bundle/monster-rpg-256x256-icons/shadow/31.png", // mushroom-spirit /* THEME-MISMATCH */
  "dragon":         "assets/raw-bundle/monster-rpg-256x256-icons/shadow/48.png", // red dragon (canonical)
};

/* ════════════════════════════════════════════════════════════════════
   BUNDLE_ICON_GAPS — assets to purchase before next icon pass
   ════════════════════════════════════════════════════════════════════
   These items are currently using PLACEHOLDER icons (marked above).
   Purchase the listed pack types to upgrade the visuals. Each gap is
   sized so a typical 48-icon pack covers it.

   1. WOOD / LOGS / PLANKS PACK  (~48 icons)
      Affected items: normal_log, oak_log, willow_log, maple_log,
        yew_log, normal_plank, oak_plank, willow_plank, maple_plank,
        yew_plank
      Why: no current pack contains felled-tree or sawn-plank visuals.
      Look for: search "log icons", "lumber pack", "wood material icons"
        on Itch.io / GameDev Market / GraphicRiver.
      Currently using: earthly-loot-rpg-icon-pack textures (best fit but
        not actually logs).

   2. SKELETAL UNDEAD MONSTER PACK  (~48 icons)
      Affected: weak_skeleton, skeleton, death_knight, lich
      Why: monster-rpg-256x256 has zero skeleton-shaped creatures, only
        mushroom/spirit/wraith variants.
      Look for: "rpg skeleton enemies", "undead monster pack",
        "boss skeleton icons"
      Currently using: ghosts and spirits as substitutes (theme-mismatch).

   3. WOLF / FELINE BEAST PACK  (~24 icons)
      Affected: dire_wolf, panther, ancient_bear (shares with bear)
      Why: monster-rpg-256x256 has one bear and one beast — not enough
        for big-cat / dire-wolf differentiation.
      Look for: "wolf monster icons", "panther beast pack"

   4. BLUEPRINT / SCROLL VARIETY PACK  (~24 icons)
      Currently OK using magic-book-game-icons (8 of 48 used) but a
      dedicated "architectural blueprint" pack would read better for
      the housing system specifically.

   5. KEY PACK (10–20 icons)
      Affected: bone_key, goblin_seal, arcane_tome, obsidian_sigil,
        void_fragment, dragonsbane_key
      Why: currently borrowing two literal keys from mining pack and
        four artifact icons. A dedicated "fantasy keys" pack would let
        each dungeon key feel distinct.

   Total recommended spend: ~$20–40 on Itch.io.
   ──────────────────────────────────────────────────────────────────── */

/* INVARIANT: the BUNDLE_*_ICON maps above are INERT. They point at
   `assets/raw-bundle/`, which is not shipped (CLAUDE.md §7 forbids
   referencing it), so applying them would paint broken-image squares.
   They are kept only as the shopping list the gaps note above costs out,
   and nothing reads them but the console.log at the end of this function.
   applyLocalIcons() below maps the curated subset under
   `assets/icons-bundle/` instead; anything unmapped falls through to the
   glyph atlas, never to a data-table emoji. */
window._skillIcon   = window._skillIcon   || {};
window._itemPath    = window._itemPath    || {};
window._monsterIcon = window._monsterIcon || {};

/* The curated art actually shipped, under assets/icons-bundle/:
     buildings/ resources/ medieval/ painted/ hearthfire/
   To wire new art, drop it there and add a row to a LOCAL_*_ICON map. */
(function applyLocalIcons(){
  // Items we ship art for — keys match game item IDs in ITEMS / MONSTERS / SKILLS.
  // If a key is missing here the renderer falls through to the emoji (m.icon).
  var LOCAL_ITEM_ICON = {
    /* WOOD. Every log shares ONE log sprite and every plank ONE plank sprite;
       the tier is read from the CSS tint (itemTintClass + the .tint-* rules),
       not from separate art. Res_24 is the round log, Res_04 the sawn plank —
       do not swap them back. */
    normal_log:  'assets/icons-bundle/resources/Res_24_log.png',
    oak_log:     'assets/icons-bundle/resources/Res_24_log.png',
    willow_log:  'assets/icons-bundle/resources/Res_24_log.png',
    maple_log:   'assets/icons-bundle/resources/Res_24_log.png',
    yew_log:     'assets/icons-bundle/resources/Res_24_log.png',
    duskwood_log:'assets/icons-bundle/resources/Res_24_log.png',
    runewood_log:'assets/icons-bundle/resources/Res_24_log.png',
    normal_plank:'assets/icons-bundle/resources/Res_04_wood.png',
    oak_plank:   'assets/icons-bundle/resources/Res_04_wood.png',
    willow_plank:'assets/icons-bundle/resources/Res_04_wood.png',
    maple_plank: 'assets/icons-bundle/resources/Res_04_wood.png',
    yew_plank:   'assets/icons-bundle/resources/Res_04_wood.png',
    duskwood_plank:'assets/icons-bundle/resources/Res_04_wood.png',
    runewood_plank:'assets/icons-bundle/resources/Res_04_wood.png',
    /* ORE. An ore is a CHUNK (Res_14–20, coloured per metal) and a bar is an
       ingot: mining must never hand back the smelted result. */
    copper_ore:    'assets/icons-bundle/resources/Res_15_stone.png',   // brown
    iron_ore:      'assets/icons-bundle/resources/Res_14_stone.png',   // grey
    silver_ore:    'assets/icons-bundle/resources/Res_18_stone.png',   // pale grey
    gold_ore:      'assets/icons-bundle/resources/Res_20_goldmine.png',// gold-veined
    mithril_ore:   'assets/icons-bundle/resources/Res_19_stone.png',   // blue
    emberstone_ore:'assets/icons-bundle/resources/Res_16_stone.png',   // red
    dawnstone_ore: 'assets/icons-bundle/resources/Res_17_stone.png',   // violet
    coal:          'assets/icons-bundle/resources/Res_14_stone.png',
    copper_bar:  'assets/icons-bundle/resources/Res_02_cooperbar.png',
    bronze_bar:  'assets/icons-bundle/resources/Res_02_cooperbar.png',
    iron_bar:    'assets/icons-bundle/resources/Res_07_ironbar.png',
    steel_bar:   'assets/icons-bundle/resources/Res_01_silverbar.png',
    silver_bar:  'assets/icons-bundle/resources/Res_01_silverbar.png',
    gold_bar:    'assets/icons-bundle/resources/Res_03_goldenbar.png',
    mithril_bar: 'assets/icons-bundle/resources/Res_05_magicbar.png',
    rune_bar:    'assets/icons-bundle/resources/Res_06_magicbar.png',
    ember_bar:   'assets/icons-bundle/resources/Res_06_magicbar.png',
    dawn_bar:    'assets/icons-bundle/resources/Res_03_goldenbar.png',
    stone:       'assets/icons-bundle/resources/Res_08_stones.png',
    mushroom:    'assets/icons-bundle/resources/Res_125_mushroom.png',
    dragon_egg:  'assets/icons-bundle/resources/Res_127_dragonegg.png',
    // Misc craft items
    anvil:       'assets/icons-bundle/medieval/BlacksmithInstruments.png',
    /* Castle Stores goods. `keystone` is deliberately ABSENT: no shipped art
       reads as a cut masonry block, so it keeps its atlas glyph rather than
       wear a wrong painting. An honest glyph beats a wrong picture. */
    timber_beam:  'assets/icons-bundle/resources/Res_23_oldwood.png',
    field_ration: 'assets/icons-bundle/resources/Res_137_bread.png',
    iron_fitting: 'assets/icons-bundle/medieval/Cog.png',
    // b186: PAINTED gear (weapons/armor/jewelry) — CraftPix packs, 128px.
    // Tier ornateness climbs with rarity; rarity BORDER (not sprite tint)
    // shows the upgrade (see itemRarity() + .rarity-* frame CSS).
    bronze_sword:      'assets/icons-bundle/painted/gear/bronze_sword.png',
    iron_sword:        'assets/icons-bundle/painted/gear/iron_sword.png',
    steel_sword:       'assets/icons-bundle/painted/gear/steel_sword.png',
    rune_sword:        'assets/icons-bundle/painted/gear/rune_sword.png',
    chief_blade:       'assets/icons-bundle/painted/gear/chief_blade.png',
    captains_ribblade: 'assets/icons-bundle/painted/gear/captains_ribblade.png',
    apprentice_staff:  'assets/icons-bundle/painted/gear/apprentice_staff.png',
    oak_staff:         'assets/icons-bundle/painted/gear/oak_staff.png',
    shortbow:          'assets/icons-bundle/painted/gear/shortbow.png',
    longbow:           'assets/icons-bundle/painted/gear/longbow.png',
    stone_maul:        'assets/icons-bundle/painted/gear/stone_maul.png',
    iron_warhammer:    'assets/icons-bundle/painted/gear/iron_warhammer.png',
    iron_helm:         'assets/icons-bundle/painted/gear/iron_helm.png',
    steel_helm:        'assets/icons-bundle/painted/gear/steel_helm.png',
    iron_platebody:    'assets/icons-bundle/painted/gear/iron_platebody.png',
    steel_platebody:   'assets/icons-bundle/painted/gear/steel_platebody.png',
    leather_gloves:    'assets/icons-bundle/painted/gear/leather_gloves.png',
    bronze_belt:       'assets/icons-bundle/painted/gear/bronze_belt.png',
    copper_ring:       'assets/icons-bundle/painted/gear/copper_ring.png',
    hunter_necklace:   'assets/icons-bundle/painted/gear/hunter_necklace.png',
    // b193: PAINTED consumables / crops / drops / gems (CraftPix veg + food +
    // monster-loot + gems packs). Replaces the emoji that clashed with the art.
    turnip:        'assets/icons-bundle/painted/items/turnip.png',
    carrot:        'assets/icons-bundle/painted/items/carrot.png',
    potato:        'assets/icons-bundle/painted/items/potato.png',
    tomato:        'assets/icons-bundle/painted/items/tomato.png',
    pumpkin:       'assets/icons-bundle/painted/items/pumpkin.png',
    wheat:         'assets/icons-bundle/painted/items/wheat.png',
    /* b217: SEEDS. All six seed items rendered the same 🌱 emoji, so the seed
       shop was six identical rows and the farm's crop list showed one green
       sprout per crop. Seeds now show the crop they grow — the standard RPG
       convention, and it uses painted art the game already ships instead of
       adding six new assets. */
    turnip_seed:   'assets/icons-bundle/painted/items/turnip.png',
    carrot_seed:   'assets/icons-bundle/painted/items/carrot.png',
    potato_seed:   'assets/icons-bundle/painted/items/potato.png',
    tomato_seed:   'assets/icons-bundle/painted/items/tomato.png',
    pumpkin_seed:  'assets/icons-bundle/painted/items/pumpkin.png',
    wheat_seed:    'assets/icons-bundle/painted/items/wheat.png',
    cooked_shrimp: 'assets/icons-bundle/painted/items/cooked_shrimp.png',
    cooked_trout:  'assets/icons-bundle/painted/items/cooked_trout.png',
    cooked_lobster:'assets/icons-bundle/painted/items/cooked_lobster.png',
    cooked_shark:  'assets/icons-bundle/painted/items/cooked_shark.png',
    slime_gel:     'assets/icons-bundle/painted/items/slime_gel.png',
    sticky_core:   'assets/icons-bundle/painted/items/sticky_core.png',
    bat_wing:      'assets/icons-bundle/painted/items/bat_wing.png',
    wolf_pelt:     'assets/icons-bundle/painted/items/wolf_pelt.png',
    troll_hide:    'assets/icons-bundle/painted/items/troll_hide.png',
    vamp_dust:     'assets/icons-bundle/painted/items/vamp_dust.png',
    demon_shard:   'assets/icons-bundle/painted/items/demon_shard.png',
    dragon_scale:  'assets/icons-bundle/painted/items/dragon_scale.png',
    lich_soul:     'assets/icons-bundle/painted/items/lich_soul.png',
    magic_essence: 'assets/icons-bundle/painted/items/magic_essence.png',
    razor_claw:    'assets/icons-bundle/painted/items/razor_claw.png',
    ancient_claw:  'assets/icons-bundle/painted/items/ancient_claw.png',
    goblin_ear:    'assets/icons-bundle/painted/items/goblin_ear.png',
    shadow_pelt:   'assets/icons-bundle/painted/items/shadow_pelt.png',
    bones:         'assets/icons-bundle/painted/items/bones.png',
    big_bones:     'assets/icons-bundle/painted/items/big_bones.png',
    dragon_bones:  'assets/icons-bundle/painted/items/dragon_bones.png',
    ruby:          'assets/icons-bundle/painted/items/ruby.png',
    dragon_gem:    'assets/icons-bundle/painted/items/dragon_gem.png',
    // b202: painted TOOL icons (SYS-3 ladder — no emoji in the item grid).
    // Picks/rods share a base per type; rarity borders convey the tier.
    bronze_axe:      'assets/icons-bundle/painted/gear/bronze_axe.png',
    iron_axe:        'assets/icons-bundle/painted/gear/iron_axe.png',
    steel_axe:       'assets/icons-bundle/painted/gear/steel_axe.png',
    mithril_axe:     'assets/icons-bundle/painted/gear/mithril_axe.png',
    rune_axe:        'assets/icons-bundle/painted/gear/rune_axe.png',
    bronze_pickaxe:  'assets/icons-bundle/painted/gear/bronze_pickaxe.png',
    iron_pickaxe:    'assets/icons-bundle/painted/gear/iron_pickaxe.png',
    steel_pickaxe:   'assets/icons-bundle/painted/gear/steel_pickaxe.png',
    mithril_pickaxe: 'assets/icons-bundle/painted/gear/mithril_pickaxe.png',
    rune_pickaxe:    'assets/icons-bundle/painted/gear/rune_pickaxe.png',
    willow_rod:      'assets/icons-bundle/painted/gear/willow_rod.png',
    oak_rod:         'assets/icons-bundle/painted/gear/oak_rod.png',
    maple_rod:       'assets/icons-bundle/painted/gear/maple_rod.png',
    yew_rod:         'assets/icons-bundle/painted/gear/yew_rod.png',
    runewood_rod:    'assets/icons-bundle/painted/gear/runewood_rod.png',
    /* b217: these six all pointed at ONE seed.png, and being later in the
       object literal they overwrote the per-crop mapping added above — so the
       seed shop was six identical rows again and the crop each seed grows was
       unreadable. Seeds show their crop (the standard RPG convention, and it
       uses art the game already ships). See the turnip_seed…wheat_seed block
       further up; nothing is mapped here so that block wins. */
  };


  /* HEARTHFIRE ITEM ART — the applier only; the 386-entry manifest is data in
     `src/data/item-art.js`, which DERIVES `<id>.png` from the id so the map
     and the filenames cannot drift apart. What art exists is data; where it
     goes is code.

     THE MERGE ORDER IS THE TRAP. This runs while legacy.js loads, BEFORE
     main.js merges the ESM data; main.js calls this the moment the manifest
     is imported, which is still before __mapGeneratedGearIcons() re-runs on
     the readiness edge. So hearthfire art is already in LOCAL_ITEM_ICON when
     the generated-tier pass looks for gaps, and its `if (LOCAL_ITEM_ICON[id])
     return` guard stops a generic tier silhouette overwriting a real
     painting. Asserted by the b358 smoke guard. */
  window.__applyHearthfireItemIcons = function applyHearthfireItemIcons(map){
    if (!map) return 0;
    var n = 0;
    Object.keys(map).forEach(function(k){
      LOCAL_ITEM_ICON[k] = map[k];
      window._itemPath = window._itemPath || {};
      window._itemPath[k] = map[k];
      window._itemSVG = window._itemSVG || {};
      window._itemSVG[k] = '<img src="'+map[k]+'" alt="" loading="lazy" draggable="false" style="width:100%;height:100%;object-fit:contain" />';
      n++;
    });
    return n;
  };


  // House rooms — the ROOMS dict has 6 entries (kitchen, forge, library,
  // garden, trophy, cellar). We render these with a custom icon attribute
  // on the room card. b103 maps each to a hand-painted building.
  var LOCAL_ROOM_ICON = {
    kitchen: 'assets/icons-bundle/buildings/House_01_nobg.png',
    forge:   'assets/icons-bundle/buildings/Building_02_blacksmith_nobg.png',
    library: 'assets/icons-bundle/buildings/Building_18_tower_nobg.png',
    garden:  'assets/icons-bundle/buildings/Windmill_01_nobg.png',
    trophy:  'assets/icons-bundle/buildings/Building_20_citadel_nobg.png',
    cellar:  'assets/icons-bundle/buildings/Building_07_house_nobg.png'
  };

  // Plot buildings on the Farm
  var LOCAL_PLOT_ICON = {
    farm_plot:   'assets/icons-bundle/buildings/Farm_01_nobg.png',
    toolshed:    'assets/icons-bundle/buildings/Building_06_house_nobg.png',
    watchtower:  'assets/icons-bundle/buildings/Tower_01_nobg.png'
    // scarecrow intentionally omitted — no scarecrow art in pack, emoji fits
  };

  /* The tier ladder generates ~70 armour/weapon pieces with no painted art of
     their own. The locked art direction is "gear tier = RARITY BORDER, not a
     recoloured sprite", so a SLOT shares one silhouette across every tier and
     the border conveys the tier. Map each generated piece to the shipped art
     for its slot, at the closest tier we own. */
  window.__mapGeneratedGearIcons = function mapGeneratedGear(){
    var byTier = function(list){            // pick the closest owned tier art
      return function(tier){ return list[Math.min(tier, list.length) - 1] || list[list.length - 1]; };
    };
    var G_ = 'assets/icons-bundle/painted/gear/';
    var SLOT_ART = {
      helm:      byTier([G_+'iron_helm.png',      G_+'iron_helm.png',      G_+'steel_helm.png']),
      platebody: byTier([G_+'iron_platebody.png', G_+'iron_platebody.png', G_+'steel_platebody.png']),
      gauntlets: byTier([G_+'leather_gloves.png']),
      belt:      byTier([G_+'bronze_belt.png']),
      sword:     byTier([G_+'bronze_sword.png', G_+'iron_sword.png', G_+'steel_sword.png', G_+'steel_sword.png', G_+'rune_sword.png']),
      warhammer: byTier([G_+'stone_maul.png', G_+'iron_warhammer.png']),
      bow:       byTier([G_+'shortbow.png', G_+'longbow.png']),
      staff:     byTier([G_+'apprentice_staff.png', G_+'oak_staff.png']),
    };
    var ITEMS_ = window.ITEMS || {};
    Object.keys(ITEMS_).forEach(function(id){
      if (LOCAL_ITEM_ICON[id]) return;                  // hand-mapped art wins
      var def = ITEMS_[id];
      if (!def || !def.tier) return;                    // only generated tier gear
      /* b282 fix (Tyler: "hovering an item shows a completely different asset"):
         the b278 armour triangle added leather/cloth lines whose ids (leather_helmet,
         apprentice_helmet, …) match the plate SLOT_ART suffixes ('_helm', 'belt'),
         so a cloth mage-hat and a leather coif were being painted as an IRON PLATE
         HELM — the wrong silhouette, worse than an emoji. Only the PLATE line may
         borrow the plate art here; leather/cloth fall to their honest fallback until
         their own art ships (asset backlog). Weapons carry no armourClass, so they
         pass through unaffected. */
      if (def.type === 'armor' && def.armourClass && def.armourClass !== 'plate') return;
      /* b224 fix: a bare `id.indexOf(k) === id.length - k.length` is TRUE by
         coincidence whenever k is absent (indexOf === -1) AND k is exactly one
         character longer than id (id.length - k.length === -1 too) — it was
         never actually checking "ends with k". That silently painted `keystone`
         (a Castle Stores good, not gear) as a steel platebody, because
         'platebody'/'gauntlets'/'warhammer' are all 9 chars and 'keystone' is
         8. Require a REAL suffix match: the substring must be found (idx>=0)
         at exactly the tail of id. */
      var key = Object.keys(SLOT_ART).filter(function(k){
        var idx = id.indexOf(k);
        return id.indexOf('_' + k) > 0 || (idx >= 0 && idx === id.length - k.length);
      })[0];
      if (!key) return;
      LOCAL_ITEM_ICON[id] = SLOT_ART[key](def.tier);
      window._itemPath = window._itemPath || {};
      window._itemPath[id] = LOCAL_ITEM_ICON[id];
      window._itemSVG = window._itemSVG || {};
      window._itemSVG[id] = '<img src="'+LOCAL_ITEM_ICON[id]+'" alt="" loading="lazy" draggable="false" style="width:100%;height:100%;object-fit:contain" />';
    });
  };
  window.__mapGeneratedGearIcons();

  /* ══════════════════════════════════════════════════════════════════════
     THE ICON-READINESS EDGE — the contract that makes icon flicker impossible.

     This function runs while legacy.js loads, so `window._itemPath` is only
     partly filled: the rest arrives when main.js (a module, therefore
     deferred) merges `src/data/*` and applies the Hearthfire manifest.
     Anything painted in between draws blank tiles and, without this edge,
     is never repainted because nothing tells it the map grew.

     THE INVARIANTS, each load-bearing:
       • IDEMPOTENT and one-shot — a double call is free, and the latch is
         the public fact `window.__hrIconsReadyAt` rather than a private
         boolean, so there is one piece of state instead of two that can
         disagree, and tests/icon-boot-order.mjs can re-arm it and drive the
         late-merge branch for real instead of asserting about source text.
       • the generated-gear pass runs HERE, at the only moment it can
         succeed — after the ESM ITEMS merge — never on a guessed delay.
       • the repaint goes through `showTab(activeTab)`, the engine's own
         "render this destination" entry, so every current AND future
         icon-bearing screen is covered with no registry to maintain.
       • it repaints ONLY if `boot()` has already painted a screen against
         the short map. `#panel-profile` ships `class="panel active"` in
         index.html, so "a panel is active" is NOT a usable proxy for "the
         engine has painted" — it is true before `loadLocal()` has run, and
         repainting there would render a screen from default state.

     The 1500 ms timer below is ONLY the fallback for main.js never executing
     (module parse error, blocked asset); it is idempotent against the real
     call, so the normal path costs one no-op.
     ══════════════════════════════════════════════════════════════════════ */

  /* The repaint itself, named because it is the load-bearing half and the
     thing a test must be able to falsify on its own. `showTab(activeTab)` is
     the engine's own "render this destination" entry point, so every current
     AND future icon-bearing screen is covered without a registry.

     KNOWN LIMITATION: showTab() calls closeAllModals(). The edge that uses
     this fires during boot, before the player can have opened anything, so
     there is nothing to close — but do not repurpose this as a general
     "refresh" for a running session without addressing that. */
  window.__hrRepaintActive = function repaintActive(){
    var tab = getActiveTab() || null;
    if (tab && typeof window.showTab === 'function') { window.showTab(tab); return true; }
    if (typeof refreshAll === 'function') { refreshAll(); return true; }
    return false;
  };

  window.__hrIconsReady = function iconsReady(){
    if (window.__hrIconsReadyAt) return false;
    window.__hrIconsReadyAt = Date.now();
    try {
      window.__mapGeneratedGearIcons();
      /* The doll is built once and cached (buildTibiaDoll bails when a
         .td-doll already exists), so drop it to force a rebuild with the
         freshly-mapped art. */
      document.querySelectorAll('.td-wrap, .td-doll').forEach(function(n){ n.remove(); });
      /* Did the engine already paint a screen with the short map? */
      if (window.__hrBooted) {
        window.__hrIconRepaint = true;
        window.__hrRepaintActive();
      }
    } catch(e){ try { window.captureException && window.captureException(e); } catch(_){} }
    return true;
  };
  setTimeout(function(){ try { window.__hrIconsReady(); } catch(e){} }, 1500);

  // Apply: override window._itemPath for known IDs. Item-render code
  // already prefers _itemPath over emoji.
  window._itemPath = window._itemPath || {};
  Object.keys(LOCAL_ITEM_ICON).forEach(function(k){
    window._itemPath[k] = LOCAL_ITEM_ICON[k];
  });
  // Rebuild _itemSVG for the items we just overrode
  window._itemSVG = window._itemSVG || {};
  Object.keys(LOCAL_ITEM_ICON).forEach(function(k){
    var p = LOCAL_ITEM_ICON[k];
    window._itemSVG[k] = '<img src="'+p+'" alt="" loading="lazy" draggable="false" style="width:100%;height:100%;object-fit:contain" />';
  });

  // Expose the room/plot maps so renderHouse / renderFarm can read them.
  window._roomIcon = LOCAL_ROOM_ICON;
  window._plotBuildingIcon = LOCAL_PLOT_ICON;

  /* _skillIcon is DELIBERATELY EMPTY: no hand-painted skill art ships yet, so
     every skill falls through to its struck medallion in the glyph atlas
     (skillIconHTML). Filling this with raw-bundle paths would 404. */
  window._skillIcon = {};

  /* MONSTER PORTRAITS ARE NOT AUTHORED HERE. `src/data/monster-art.js` is the
     single source of truth and main.js applies it; this map stays EMPTY so
     there is never a second opinion about a path or a race with the manifest.
     The manifest can express "awaiting art" (most of the roster has no
     portrait yet) — a literal here could only be a 404 or a silent omission. */
  var LOCAL_MONSTER_ICON = {};
  window._monsterIcon = window._monsterIcon || {};
  Object.keys(LOCAL_MONSTER_ICON).forEach(function(k){
    window._monsterIcon[k] = LOCAL_MONSTER_ICON[k];
  });

  // b186: canonical painted player portrait (dwarf/human avatar pack).
  // Arena, topbar, and character page all read this.
  window._playerAvatar = 'assets/icons-bundle/painted/npc/player.png';

  console.info('[icons-bundle b103] applied:',
    Object.keys(LOCAL_ITEM_ICON).length, 'items,',
    Object.keys(LOCAL_ROOM_ICON).length, 'rooms,',
    Object.keys(LOCAL_PLOT_ICON).length, 'plot buildings');
})();

// Rebuild _itemSVG which is consumed by older render paths
window._itemSVG = window._itemSVG || {};
Object.keys(window._itemPath).forEach(function(id){
  var p = window._itemPath[id];
  if(p) window._itemSVG[id] = '<img src="'+p+'" alt="" loading="lazy" draggable="false" style="width:100%;height:100%;object-fit:contain" />';
});

// Force a paint refresh of UI surfaces that show icons
function refreshAll(){
  try { if(typeof renderInvFancy==='function') renderInvFancy(); } catch(e){}
  try { if(typeof renderInvNew==='function') renderInvNew(); } catch(e){}
  try { if(typeof renderInventory==='function') renderInventory(); } catch(e){}
  try { if(typeof renderSkillsList==='function') renderSkillsList(); } catch(e){}
  try {
    if(typeof renderSkillDetail==='function' && window.openSkill){
      // Force full rebuild by clearing cache
      window._actLastRender = {skillId:null, activeKey:null};
      renderSkillDetail(window.openSkill);
    }
  } catch(e){}
  try { if(typeof renderMonsterList==='function') renderMonsterList(); } catch(e){}
  try { if(typeof renderLoadout==='function') renderLoadout(); } catch(e){}
  try { if(typeof renderProfile==='function') renderProfile(); } catch(e){}
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded', function(){ setTimeout(refreshAll, 200); });
} else {
  setTimeout(refreshAll, 200);
}

console.log('[Bundle Icons v1] applied:',
  Object.keys(BUNDLE_SKILL_ICON).length, 'skills,',
  Object.keys(BUNDLE_ITEM_ICON).length, 'items,',
  Object.keys(BUNDLE_MONSTER_ICON).length, 'monsters');
}

/* ── EXPORTS ───────────────────────────────────────────────────────────────
   The bare names are a CONTRACT: ~15 files outside this one already read
   window.itemArt / itemFallbackIcon / skillIconHTML / itemTintClass, and
   legacy.js's own render functions call them as bare globals. They keep the
   exact names and the exact `||` shape they had in legacy.js.

   Everything legacy.js used to keep private (setActivityIcon, actIconHtml, the
   DOM walkers, the installer) is reached through the namespace instead, so a
   move does not quietly add four generic globals to the page. */
window.itemGlyphKey = itemGlyphKey;
window.itemFallbackIcon = itemFallbackIcon;
window.itemArt = window.itemArt || itemArt;
window.monsterFallbackIcon = monsterFallbackIcon;
window.monsterArt = monsterArt;
window.skillIconHTML = skillIconHTML;
window.slotIconHTML = slotIconHTML;
window.itemTintClass = itemTintClass;

window.HearthriseIcons = {
  itemGlyphKey: itemGlyphKey,
  itemFallbackIcon: itemFallbackIcon,
  itemArt: itemArt,
  monsterFallbackIcon: monsterFallbackIcon,
  monsterArt: monsterArt,
  skillIconHTML: skillIconHTML,
  slotIconHTML: slotIconHTML,
  itemTintClass: itemTintClass,
  setActivityIcon: setActivityIcon,
  actIconHtml: actIconHtml,
  paintSkillIcons: paintSkillIcons,
  paintMonsterIcons: paintMonsterIcons,
  installIconLayer: installIconLayer,
};
})();
