# 치장템 그림 요청 프롬프트 (ChatGPT / Gemini 용)

쓰는 법 (품질 우선으로 나눔: 한 장에 10~11개, 4×3 칸)
- 프롬프트 2개를 **한 대화에서 차례로** 쓴다. 프롬프트 1을 붙여 넣으면 1장째가 나오고, `next` 를 보낼 때마다 다음 장(총 4장). 그다음 같은 대화에 프롬프트 2를 붙여 넣고 `next` 한 번(총 2장). 모두 6장, 같은 대화라 그림체가 맞춰진다.
- 그림 방식은 품목마다 다르게: [REAL] 실사, [SEMI] 게임 아이템풍, [TOON] 과장된 카툰·밈(표정 있음). 웃긴 건 확실히 웃기게, 현실적인 건 진짜처럼.
- 배경 투명 PNG 가 되면 제일 좋고, 안 되면 흰 배경도 괜찮다(내가 잘라서 배경을 지운다).
- 받은 그림 파일을 그대로 보내 주면 칸을 잘라 다듬어서 바로 적용한다. 칸 순서 = 왼쪽 위부터 오른쪽으로, 번호 순서.
- 마음에 안 드는 칸만 "Redraw only cell N, same style: …" 로 다시 요청해도 된다.

---

## 프롬프트 1 — 모자 20개 + 악세 22개 (그림 4장: 1–10 / 11–20 / 21–31 / 32–42, 사이에 `next`)

```
I need cosmetic item art for a Korean meme-humour online card game (poker / party games). The items are overlays that sit on a player's CIRCULAR profile picture. You will make the HATS (items 1–20) and ACCESSORIES (items 21–42) below as a series of sprite-sheet images, all in exactly the same style. Make ONE image now with items 1–10; when I reply "next", make the next image with the next 10–11 items (11–20, then 21–31, then 32–42).

LAYOUT OF EACH IMAGE (very important)
- 4 columns × 3 rows = 12 equal square cells, thin light-grey grid lines between cells. Fill cells in item order, left-to-right, top-to-bottom; leave unused cells empty.
- Transparent background (PNG) if you can; otherwise flat pure white (#FFFFFF).
- ONE item per cell, centred, filling about 75% of the cell, never touching or crossing the grid lines. Nothing overlaps between cells.
- No background shadows, no scenery, no faces, no heads, no people, no hands (unless the item itself is a hand-held object). Draw ONLY the object.
- NO text, numbers, labels or watermarks anywhere in the image, except text that is part of an item and explicitly requested below.

STYLE — MIXED RENDERING, CHOSEN PER ITEM (this is the most important rule)
- Do NOT draw everything in one flat style. Each item gets the treatment that makes it funniest or most convincing, marked below:
  [REAL] = photorealistic object: true materials and textures (real hair strands, crinkled plastic, fabric weave, brushed metal, glass, skin-safe makeup texture), realistic lighting. Example: a steel drum or a gold chain should look like a real product photo.
  [SEMI] = stylised but believable, like a high-end mobile game item render: clean shapes, rich shading, gloss and glow.
  [TOON] = full cartoon / meme: exaggerated shapes, bold outline, and where it is funny give the object its own comic face or attitude (angry eyebrows, smug grin, crying eyes, rage veins, sweat drops). Example: a national-flag headband can be wildly exaggerated and flapping dramatically; a flaming head can have an angry face in the fire.
- Humour first: funny items must be laugh-out-loud funny and over the top; realistic items must be genuinely convincing. Pick the details that make each item recognisable and memorable — variety across items is wanted.
- What keeps the set together: every item cleanly cut out, centred, same scale logic, consistent light from the top-left, a subtle soft contact shadow under the object only, no background.
- Rarity by tier (shown through detail and glow, no frames or badges): tier 0 junk = cheap, scruffy; tier 1 common = clean everyday; tier 2 concept = bolder, more character; tier 3 legend = rich gold/glow accents and sparkles; tier 4 mythic = most spectacular, rainbow or divine glow.

HATS (items 1–20) and ACCESSORIES (items 21–42) below as a series of sprite-sheet images, all in exactly the same style. Make ONE image now with items 1–10; when I reply "next", make the next image with the next 10–11 items (11–20, then 21–31, then 32–42).

LAYOUT OF EACH IMAGE (very important)
- 4 columns × 3 rows = 12 equal square cells, thin light-grey grid lines between cells. Fill cells in item order, left-to-right, top-to-bottom; leave unused cells empty.
- Transparent background (PNG) if you can; otherwise flat pure white (#FFFFFF).
- ONE item per cell, centred, filling about 75% of the cell, never touching or crossing the grid lines. Nothing overlaps between cells.
- No background shadows, no scenery, no faces, no heads, no people, no hands (unless the item itself is a hand-held object). Draw ONLY the object.
- NO text, numbers, labels or watermarks anywhere in the image, except text that is part of an item and explicitly requested below.

STYLE (keep identical across every image)
- Premium mobile-game item icon meets Korean internet meme sticker: bold clean dark outline (about 3–4 px at 1024 px), saturated colours, soft cel shading with one highlight and one shadow tone, a little gloss on metal/plastic. Funny, cheeky, slightly crude, exaggerated — but cleanly rendered, not sloppy.
- Front-facing or 3/4 front view, consistent light from top-left, same line weight and scale logic in every cell.
- Rarity feel by tier (do not draw frames or badges, just quality of detail): tier 0 junk = cheap, scruffy materials; tier 1 common = clean everyday; tier 2 concept = bolder, more character; tier 3 legend = rich gold/glow accents, sparkle highlights; tier 4 mythic = most spectacular, rainbow or divine glow.

HATS (items 1–20): drawn as if worn on top of an invisible round head seen from the front; the bottom edge of each hat is where the head would be (a gentle upward curve). Hats must be WIDE and LOW so they read on a small circle.
1. [REAL] (tier 0) Korean military winter field cap, olive drab quilted "kkalkkali" liner style, slightly crumpled.
2. [REAL] (tier 0) Korean reserve-forces patrol cap, faded digital camo, slightly too small.
3. [REAL] (tier 0) A black plastic grocery bag worn as a hat, handles sticking up like ears.
4. [REAL] (tier 0) A folded newspaper paper-hat (boat shape), Korean-looking newsprint texture (no readable words).
5. [TOON] (tier 0) A pair of white briefs worn on the head like a hat, leg holes as eye-hole-ish openings on the sides — silly, not explicit.
6. [REAL] (tier 1) Casino dealer visor cap, green translucent visor with a black band.
7. [REAL] (tier 1) Traditional Korean conical bamboo hat "satgat", wide brim, woven texture.
8. [REAL] (tier 1) "Sheep-head" towel hat from Korean saunas (jjimjilbang): a pink towel rolled into two side buns.
9. [SEMI] (tier 1) Delivery-rider motorcycle helmet, glossy, with a little food-delivery box logo shape (no text).
10. [TOON] (tier 1) A white toilet seat lid worn as a hat, lid open upward like a crown — the lid has a disgusted cartoon face.
11. [TOON] (tier 2) Headband with the Korean national flag pattern (taegeuk circle + trigrams) tied around the forehead, flag ends absurdly long and flapping dramatically in the wind — over-the-top patriotic, comedic.
12. [REAL] (tier 2) Red protest headband with the Korean text "단결 투쟁" in bold white letters (this text is allowed).
13. [REAL] (tier 2) A hair-loss wig with realistic individual hair strands, but obviously fake: too shiny, too thick, slightly crooked.
14. [SEMI] (tier 2) A bald shiny skinhead top: just a glossy skin-toned dome cap with a big comedic shine highlight.
15. [SEMI] (tier 2) Prison cap, striped grey/white, with a blank number patch.
16. [REAL] (tier 3) Royal golden crown, jewels (ruby, sapphire, emerald), strong light reflections and sparkles.
17. [REAL] (tier 3) Military combat helmet with night-vision goggles flipped down, green lens glow.
18. [TOON] (tier 3) Burning head: a crown of orange-yellow flames shaped like a hairdo, glowing, with a furious cartoon face formed in the flames.
19. [SEMI] (tier 4) Floating golden angel halo ring, divine glow, small light rays.
20. [REAL] (tier 4) "Gangsik boss" hat: luxurious black-and-gold mafia fedora, gold band with a small gem, a poker chip tucked into the band, aura of wealth.

ACCESSORIES (items 21–42). Draw each object alone, sized so it can be attached to the side or bottom edge of a round avatar, or placed on a face as a sticker:
21. [REAL] (tier 0) A lit cigarette with a thin wisp of smoke, horizontal.
22. [REAL] (tier 0) A wooden toothpick, slightly chewed, horizontal.
23. [REAL] (tier 0) A rolled-up white tissue plug for a nostril, with a tiny red spot.
24. [REAL] (tier 0) A beige adhesive bandage (band-aid), slightly crooked.
25. [TOON] (tier 0) A dangling drop of drool / saliva string, glossy, comedic.
26. [REAL] (tier 1) Black sunglasses, wide "cool guy" shape, reflective lenses.
27. [REAL] (tier 1) Thick gold chain necklace (curved, as worn), shiny.
28. [SEMI] (tier 1) A casino poker chip held in teeth position (just the chip, slightly tilted, bite marks).
29. [REAL] (tier 1) A single dangling dice earring (small hoop + one die).
30. [REAL] (tier 1) A green Korean soju bottle, glossy glass, blank label.
31. [REAL] (tier 2) A fat cigar with a gold band, lit tip, smoke curl.
32. [TOON] (tier 2) A cartoon pistol pointing sideways (as if to a temple), toy-like, not realistic, no blood.
33. [REAL] (tier 2) A protest megaphone / loudspeaker, white and red.
34. [REAL] (tier 2) Hospital IV drip bag on a pole with tube.
35. [REAL] (tier 2) Electronic ankle monitor (black strap with a small box and green LED).
36. [REAL] (tier 2) Steel handcuffs, linked, shiny.
37. [TOON] (tier 3) Pair of red laser-beam eyes: two glowing red eye shapes with short laser streaks (just the glow, no face).
38. [SEMI] (tier 3) A fan of Korean-won-style banknotes spread like a hand fan (generic money, no real banknote designs or text).
39. [SEMI] (tier 3) A glowing golden aura RING — a thin circular halo of light meant to surround a round avatar (draw it as an empty ring of golden light).
40. [REAL] (tier 3) Police mugshot placard: black board with blank white number lines (no readable text) — framed as if held at chest height.
41. [TOON] (tier 4) "Money-counting eyes": two eyes whose pupils are spinning gold coin / ₩ symbols, glowing.
42. [TOON] (tier 4) A black crow perched (side view) as if standing on top of a head, smug judging expression, little gold glint.

Output per image: high resolution (at least 2048×1536), crisp edges, 4×3 cells as specified. Start now with items 1–10.
```

---

## 프롬프트 2 — 페이셜 22개 (그림 2장: 1–11 / 12–22, 사이에 `next`, 같은 대화에서 이어서)

```
Next set, same game and SAME STYLE as the hats/accessories (mixed per-item rendering: [REAL] photorealistic / [SEMI] game-item render / [TOON] exaggerated cartoon-meme with comic faces). These are 22 face-decoration items (beards, makeup, marks), overlays placed on a player's CIRCULAR profile picture (which may be a real photo). Make ONE image now with items 1–11; when I reply "next", make the second image with items 12–22.

LAYOUT OF EACH IMAGE (very important)
- 4 columns × 3 rows = 12 equal square cells, thin light-grey grid lines. Fill cells in item order, left-to-right, top-to-bottom; leave the last cell empty.
- ONE item per cell, centred, never crossing grid lines.
- Transparent background (PNG) if you can; otherwise flat pure white (#FFFFFF). NO text, numbers, labels or watermarks.

HOW TO DRAW THEM (very important)
- Draw ONLY the decoration itself — NOT a face, NOT skin, NOT a head. Imagine an invisible front-facing face filling the cell (eyes at about 40% height, nose at 55%, mouth at 70%) and draw only the beard / makeup / mark in the place it would sit on that invisible face. Everything else in the cell stays white.
- "STICKER" items: a single compact element (e.g. only the moustache), centred in the cell, filling ~60%.
- "FULL-FACE" items: the complete makeup pattern spread over the whole invisible face area (eye marks + mouth + cheeks, etc.), filling ~85% of the cell, so it can be laid over a round photo.

STYLE: same MIXED RENDERING rule as before — [REAL] items photorealistic (real hair strands, real skin-makeup texture, real metal), [SEMI] stylised game-item render, [TOON] exaggerated cartoon/meme (comic, over the top). Funny ones must be really funny; realistic ones must be convincing. Rarity: tier 0 scruffy → tier 4 spectacular glow.

ITEMS
1. [REAL] (tier 0, sticker) Patchy, sparse, pathetic stubble beard — scattered short black hairs around a mouth area.
2. [REAL] (tier 0, sticker) Pair of dark purple-grey under-eye dark circles (two crescent smudges).
3. [TOON] (tier 0, sticker) A nosebleed: two thin red streams as if from nostrils, comedic.
4. [SEMI] (tier 0, full-face) Acne explosion: many red pimples and whiteheads scattered over the cheeks, forehead and chin.
5. [SEMI] (tier 0, sticker) A grinning set of front teeth with red chili-pepper flakes stuck between them.
6. [REAL] (tier 1, sticker) Classic thick black handlebar moustache, curled tips.
7. [REAL] (tier 1, sticker) Pointy goat beard (goatee) on a chin position.
8. [TOON] (tier 1, sticker) A swollen black eye: purple-blue bruise ring around one eye, cartoon style.
9. [TOON] (tier 1, sticker) Two streams of tear tracks running down from two eye positions, shiny.
10. [SEMI] (tier 1, full-face) Drunk blush: big rosy-red flushed cheeks and a red nose tip, soft gradient.
11. [REAL] (tier 2, sticker) Huge bushy bandit/mountain-man beard with sideburns, wild and messy.
12. [REAL] (tier 2, sticker) One thick connected unibrow, bold black.
13. [REAL] (tier 2, sticker) Bright red glossy lips, slightly overdrawn, kiss shape.
14. [REAL] (tier 2, full-face) Military camouflage face paint: green/brown/black stripes across the whole face area.
15. [TOON] (tier 2, full-face) Classic circus clown makeup: white-face shape outline, red nose ball, blue diamond eyes, big red smile.
16. [SEMI] (tier 2, sticker) A diagonal knife scar with stitch marks across one cheek.
17. [SEMI] (tier 3, full-face) Villain "joker" makeup (original design, not any specific film character): smeared dark eye sockets, wide red cut-smile, pale streaks, with a faint gold glint.
18. [REAL] (tier 3, sticker) A grin with one shiny gold tooth that sparkles.
19. [SEMI] (tier 3, sticker) Two streams of blood tears running from two eye positions, dark red, dramatic glow.
20. [REAL] (tier 3, full-face) Full-face tribal/ornamental tattoo pattern in black ink with subtle gold accents, symmetrical.
21. [REAL] (tier 4, full-face) Golden face: a full face-shaped mask of polished gold (only the mask, with eye holes and mouth slit), divine glow and sparkles.
22. [SEMI] (tier 4, full-face) Skull makeup (Day-of-the-Dead inspired but original): white skull face paint shape, black eye sockets, stitched-teeth mouth, with rainbow-ish glowing accents.

Output per image: high resolution (at least 2048×1536), crisp edges, 4×3 cells. Start now with items 1–11.
```

---

## 번호 ↔ 품목 id (자를 때 쓰는 표, 그림 요청에는 안 넣음)
- 프롬프트 1: 1~20 = hat.gallgalli, hat.reserve, hat.plastic, hat.newspaper, hat.panty, hat.dealer, hat.satgat, hat.towel, hat.delivery, hat.toilet, hat.taegeukband, hat.struggle, hat.wig, hat.skinhead, hat.prisoner, hat.crown, hat.nvg, hat.burning, hat.halo, hat.boss
  / 21~42 = acc.cigarette, acc.toothpick, acc.tissue, acc.bandaid, acc.drool, acc.sunglasses, acc.goldchain, acc.chipbite, acc.diceearring, acc.soju, acc.cigar, acc.pistol, acc.megaphone, acc.iv, acc.anklet, acc.handcuffs, acc.laser, acc.cashfan, acc.aura, acc.mugshot, acc.moneyeye, acc.crow
- 프롬프트 2: 1~22 = face.stubble, face.darkcircle, face.nosebleed, face.acne, face.pepper, face.mustache, face.goatee, face.blackeye, face.tears, face.blush, face.bandit, face.brow, face.lipstick, face.camo, face.clown, face.scar, face.joker, face.goldtooth, face.bloodtear, face.tattoo, face.goldface, face.skull
