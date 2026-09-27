// ════════════════════════════════════════════════════════════════════════
// src/data/lucky-rumours.js — ONE HUNTER'S RUMOUR PER LUCKY FIND
//
// Client-only display text for the lucky-find reveal sheet and the Bestiary's
// 'Where luck hides' ledger (src/features/lucky-finds.js, src/render/luck-ledger.js).
// Keyed on every {lucky:true} drop id in src/data/monsters.js. Never a stat,
// never imported by an edge-reachable module: tests/lore-notes.mjs (LORE-4..7,
// LORE-10 and the element rule) holds the lines.
// ════════════════════════════════════════════════════════════════════════
export const LUCKY_RUMOURS = Object.freeze({
  wolfbone_torc: 'Trappers swear that now and then a cub drags home a torc some old hunter lost, and will not give it up without a fight',
  bramble_blade: 'Pull enough mandrakes and one comes up with a thorned blade tangled in its roots, as though the field had been keeping it',
  banded_signet: 'Kobolds cannot tell brass from bronze, so a signet from some lost free company sometimes ends up at the bottom of a hoard',
  adept_body: 'The apprentice keeps her master’s spare robe folded under her own, and sooner or later a patient hunter finds out why',
  fang_studs: 'Bats roost where trackers once camped, and old hunters say a pair of fang studs still turns up under the roost now and then',
  rat_stick: 'Every hobgoblin sergeant carries a stick for keeping order, and one of them was carved by somebody who truly hated rats',
  willow_longbow: 'Gnolls pick over whatever a dead archer leaves behind, and one pack is said to be dragging a fine willow longbow through the hills',
  willow_staff: 'Some wights were buried with the tools of their trade, and a hedge mage’s willow staff still rises with one of them now and then',
  spidersilk_choker: 'Spiders line their nests with anything that glitters, and a choker of silk and gold has been cut from a nest more than once',
  maple_bow: 'Deserters leave the army with whatever they can carry, and the canny ones carried off the quartermaster’s best maple bows',
  lazlos_maul: 'Lazlo’s own grave was never found, but every so often a zombie climbs out of the churchyard still holding onto his maul',
  warlock_helmet: 'A warlock once tried to bind a fire devil, and the devil has worn his hat ever since as a reminder of how that went',
  wraithglass_drops: 'Giant spiders wrap whatever wanders into the web, and one of them once wrapped a lady still wearing her wraithglass drops',
  warlords_torc: 'A warlord wears his rival’s badge melted into his own collar, right up until the day a hunter claims both of them at once',
  trollhide_cape: 'The story goes that one mountain troll wandered off still wearing the cape of the last hunter who tried to skin it',
  void_censer: 'A void mote drifts through the rift with a censer caught somewhere inside its shape, and lets it go only when it comes apart',
  panthers_eye_pendant: 'Every night panther has two eyes, and the hunters of the south swear that one in a great many wears a third on a string',
  wraithsilk_shroud: 'A banshee mourns in her burial shroud, and if you silence her for good the shroud may yet stay behind when she goes',
  yew_staff: 'The chained demon was summoned with a yew staff, and the staff went down into the pit along with the fool who held it',
  yew_bow: 'Drakes nest in the old yew groves of the high passes, and now and then a bowyer’s last bow is woven into a nest',
  shadowsilk_cape: 'A shadow creeper is said to wear the cape of the first hunter it ever caught, and to give it up only when it is caught in turn',
  chitinweave_cloak: 'The broodmother’s young shed their shells in the dark of the nest, and something down there has been sewing them into a cloak',
  archmage_gloves: 'The bride wore an archmage’s gloves to her wedding, a gift from a guest who never arrived, and she wears them still',
  dragonrib_bow: 'Draconia keeps the ribs of her fallen rivals, and one of them was bent into a bow by somebody brave enough to steal it',
  runewood_staff: 'Lightning strikes the same runewood grove in every storm, and the elemental that rises there sometimes carries a staff of it',
  emberfang_blade: 'The shrine that fell was guarding a blade, and Elder Cinder is guarding it still, whether or not it remembers why',
});
