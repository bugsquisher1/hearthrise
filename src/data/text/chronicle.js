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
  sewer_title: 'Under Havora',
  sewer_teaser: 'The water under the mill has to go somewhere.',
  sewer_page: 'The water that turns the mill wheel doesn\'t stop at the mill. It runs on under Havora through old stone tunnels, and '
    + 'everything that washes off the streets ends up down there with it. So do the rats.\n\n'
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
    + 'Something went wrong at that crossing, and the company never came home. These few got away. They cut the company badge off '
    + 'their coats so people couldn\'t tell where they came from, and now they rob anybody who comes down the road.\n\n'
    + 'If you\'ve pulled one of those torn badges off a Turncoat, you\'re holding the first piece of what happened up north. The rest '
    + 'of the story is further up the road, at the crossing they ran away from.',
});
