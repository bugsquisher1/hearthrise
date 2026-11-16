// ════════════════════════════════════════════════════════════════════════
// src/data/text/chronicle.js — THE CHRONICLE'S WORDS (src/data/chronicle.js, drawn by src/shell/windows/wiki.js).
//
// Three rows a page: `<id>_title`, `<id>_teaser` (what a shut page says about itself, and nothing it would give away) and
// `<id>_page`, the story, its paragraphs split by a blank line. The story is told out loud by a person, in order, the way
// the approved Road North is (memory lore-tell-it-like-a-story): people who want things, one thing causing the next,
// plain words. Its facts are the board's canon and never contradict an item, a monster or a ground's own line.
// ════════════════════════════════════════════════════════════════════════

export const CHRONICLE_TEXT = Object.freeze({
  /* The tab, the count of open pages, and what a shut page needs: {ground} is the ground's name, a link to its page in Hunts. */
  tab: 'Chronicle',
  found: '{n} of {total} pages found',
  how_ground: 'Opens at {ground}',

  /* @sentence: the story, told out loud (lore). */
  havora_title: 'Havora and the Great Hearth',
  havora_teaser: 'This is where every hero starts.',
  havora_page: 'Everybody in Havora ends up at the Great Hearth sooner or later. It\'s the big fire in the middle of the square, and hunters '
    + 'walk up to it with bags of bones from whatever they killed that day and throw them in. That sounds strange until you know why.\n\n'
    + 'In Greenhaven, the dead only rest if they\'re burned at the Great Hearth. If they aren\'t, they get back up. Folks in town are careful '
    + 'about it, so you won\'t see any trouble here. Out on the road north it\'s a different story, and you\'ll get there.\n\n'
    + 'Right now you\'re new in town with a weapon and not much else. Tamsin Reeve keeps a board by the square, and she pays for kills. '
    + 'That\'s a good place to start.',

  /* @sentence: the story, told out loud (lore). */
  cellar_title: 'Rats Under the Mill',
  cellar_teaser: 'It\'s Tamsin\'s first job for anybody new.',
  cellar_page: 'Tamsin gives everybody new the same first job. There\'s a cellar under the mill, and it\'s full of giant rats, slimes and '
    + 'wasps. The miller can\'t get down there to work, and the rats keep getting into his grain.\n\n'
    + 'Tamsin counts every rat you kill. When you get back to town she pays you in gold, and in armor too if she has a piece that suits you.\n\n'
    + 'The wasps have a hive down there, and every so often somebody comes back up with a chunk of its comb. Throw that in the Great '
    + 'Hearth and the whole fire turns honey gold for a minute, and everybody in the square stops to watch.',

  /* @sentence: the story, told out loud (lore). */
  thicket_title: 'The Thicket',
  thicket_teaser: 'Wolves den along the brook.',
  thicket_page: 'Out past the town fields, the Meadowbrook runs through a stretch of thick pine and bramble, and that\'s where the gray '
    + 'wolves den. They mostly leave Havora alone, but walking the brook path by yourself at dusk is asking for trouble.\n\n'
    + 'The pack\'s leader is an old wolf the hunters call Grayjaw. He\'s slower than the young ones, but he got old out here for a reason, '
    + 'and plenty of hunters have come back to town with his teeth marks in their boots.\n\n'
    + 'The big Dire Grays sleep on beds of old pine, and over the years the resin soaks into the wood. Every so often somebody brings '
    + 'back a chunk of it. It burns a deep amber in the Great Hearth and spits and crackles the whole time.',

  /* @sentence: the story, told out loud (lore). */
  sewer_title: 'Under Havora',
  sewer_teaser: 'The water under the mill has to go somewhere.',
  sewer_page: 'The water that turns the mill wheel doesn\'t stop at the mill. It runs on under Havora through old stone tunnels, and '
    + 'everything that washes off the streets ends up down there with it, rats included.\n\n'
    + 'The rats in the Sewer aren\'t like the ones in the cellar. They\'re bigger and meaner, and they all seem to be heading the same '
    + 'way. You\'ll run into bats down there too, and slime that collects in the sumps. A few kobolds moved in at some point and never '
    + 'left, and the old cisterns are full of spiders.\n\n'
    + 'Ask anybody who\'s spent time down there and they\'ll tell you the rats follow the Rat King. He holds the last room, and he '
    + 'doesn\'t come out for just anybody.',

  /* @sentence: the story, told out loud (lore). */
  rat_king_title: 'The Rat King',
  rat_king_teaser: 'Something down in the Sewer wears a crown.',
  rat_king_how: 'Opens when you beat the Rat King',
  rat_king_page: 'The Rat King really does wear a crown. It\'s hammered out of the iron drain grates from the mill race, bent into '
    + 'shape and jammed on his head, and it\'s the first thing you notice when you finally get into his room.\n\n'
    + 'The second thing is his tails. A whole bunch of them are knotted together behind him, tied so tight no rat could ever pull loose, '
    + 'and hunters cut that knot off and carry it home.\n\n'
    + 'Burn the knot in the Great Hearth and the fire turns a swampy blue, pops once and hisses for about a minute. Everybody in the '
    + 'square knows what that means, because the only way to get one is to go down into the Sewer and take it off him.',

  /* @sentence: the story, told out loud (lore). */
  wickstead_title: 'The Turncoats at Wickstead',
  wickstead_teaser: 'Somebody burned a farm on the Thicket road.',
  wickstead_page: 'Wickstead used to be a farm on the Thicket road, with a house, a granary and an orchard. Then a group of armed men '
    + 'showed up, burned most of it and moved into the house. People around here call them the Turncoats.\n\n'
    + 'They were soldiers once, in the Banded Company, the hired soldiers Havora paid to guard the river crossing on the road north. '
    + 'Something went wrong at that crossing, and the company never came home. These few ran before the fighting started. They cut the badge off '
    + 'their coats so people couldn\'t tell where they came from, and now they rob anybody who comes down the road.\n\n'
    + 'If you\'ve pulled one of those torn badges off a Turncoat, you\'re holding the first piece of what happened up north. The rest '
    + 'of the story is further up the road, at the crossing they ran away from.',

  /* @sentence: the story, told out loud (lore). */
  glade_title: 'Mosslight Glade',
  glade_teaser: 'This is where the Meadowbrook starts.',
  glade_page: 'The Meadowbrook starts in Mosslight Glade, bubbling up out of springs at the foot of a copper hill. The copper gets into '
    + 'the water, and that\'s why the moss up here glows blue green after dark.\n\n'
    + 'Poachers moved in for the bears a while back and never left. Their boss is a man named Rook, and he runs the glade like he owns '
    + 'it. A few goblins have wandered down off the hill too, and they spend their days washing the stream for bits of copper.\n\n'
    + 'Keep that water in mind. It runs out of the glade and down past the river crossing on the road north, and a lot of what '
    + 'happened at that crossing ended up floating in it.',

  /* @sentence: the story, told out loud (lore). */
  warrens_title: 'Chief Coppercap',
  warrens_teaser: 'Goblins dig under the copper hill.',
  warrens_page: 'Under the copper hill, the goblins have dug so many tunnels that the whole thing is more hole than hill. They dig out '
    + 'the copper, and they steal anything else they can carry. Those pots on their heads came out of somebody\'s kitchen.\n\n'
    + 'Their chief wears the biggest pot of all, a whole cauldron, which is how he got the name Chief Coppercap. His hobgoblin foremen '
    + 'keep the diggers working, and he keeps the foremen in line by throwing hot slag at whoever slows down.\n\n'
    + 'Scrape the green crust off his stolen pots and you\'ve got a Verdigris Cake. Burn it in the Great Hearth and the fire goes '
    + 'copper green and rings like somebody hit a pot with a spoon.',

  /* @sentence: the story, told out loud (lore). The Road North's own facts (approved 2026-11-11). */
  ford_title: 'Hask\'s Ford',
  ford_teaser: 'Something happened at the river crossing.',
  ford_page: 'The road north crosses the Meadowbrook at an old toll stone. Lord Krell used to collect that toll, until Havora took the crossing away '
    + 'from him and hired Captain Hask\'s soldiers, the Banded Company, to guard it.\n\n'
    + 'Krell didn\'t want a fight with the company, so he paid Hask instead. One night Hask pulled his guards off the crossing and let '
    + 'Krell\'s men walk right over, and they wiped out the company on the spot.\n\n'
    + 'Krell\'s men didn\'t burn a single body, so you can guess what happened next. The dead got back up right where they fell, and '
    + 'that spot is called Hask\'s Ford now. Their flag bearer still walks around the toll stone with the company flag, like he never '
    + 'heard the fight ended.',
});
