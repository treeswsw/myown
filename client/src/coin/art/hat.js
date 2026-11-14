// 모자 그림 자리표 (SPEC 22-17). 그림 파일은 client/public/coin/art/<id>.webp (256x256, 투명 배경).
// w = 그림 한 변 ÷ 프사 지름, dx·dy = 그림 중심이 프사 중심에서 떨어진 정도(위쪽이 −), fx = 움직임(.lk-fx-<이름>, art.css).
export default {
  'hat.gallgalli': { src: '/coin/art/hat.gallgalli.webp', w: 0.895, dx: 0, dy: -0.498 },
  'hat.reserve': { src: '/coin/art/hat.reserve.webp', w: 0.937, dx: 0.04, dy: -0.471 },
  'hat.plastic': { src: '/coin/art/hat.plastic.webp', w: 0.832, dx: 0, dy: -0.461 },
  'hat.newspaper': { src: '/coin/art/hat.newspaper.webp', w: 0.884, dx: 0, dy: -0.528 },
  'hat.panty': { src: '/coin/art/hat.panty.webp', w: 0.832, dx: 0, dy: -0.399 },
  'hat.dealer': { src: '/coin/art/hat.dealer.webp', w: 0.989, dx: 0.03, dy: -0.386 },
  'hat.satgat': { src: '/coin/art/hat.satgat.webp', w: 1.197, dx: 0, dy: -0.534 },
  'hat.towel': { src: '/coin/art/hat.towel.webp', w: 1.041, dx: 0, dy: -0.471 },
  'hat.delivery': { src: '/coin/art/hat.delivery.webp', w: 0.937, dx: 0, dy: -0.306 },
  'hat.toilet': { src: '/coin/art/hat.toilet.webp', w: 0.807, dx: 0, dy: -0.538 },
  'hat.taegeukband': { src: '/coin/art/hat.taegeukband.webp', w: 0.989, dx: 0, dy: -0.22, fx: 'flutter' },
  'hat.struggle': { src: '/coin/art/hat.struggle.webp', w: 0.989, dx: 0, dy: -0.2, fx: 'shake' },
  'hat.wig': { src: '/coin/art/hat.wig.webp', w: 0.989, dx: 0, dy: -0.432, fx: 'wobble' },
  'hat.skinhead': { src: '/coin/art/hat.skinhead.webp', w: 0.937, dx: 0, dy: -0.481, fx: 'shine' },
  'hat.prisoner': { src: '/coin/art/hat.prisoner.webp', w: 0.989, dx: 0.03, dy: -0.508 },
  'hat.crown': { src: '/coin/art/hat.crown.webp', w: 0.832, dx: 0, dy: -0.594, fx: 'shine' },
  'hat.nvg': { src: '/coin/art/hat.nvg.webp', w: 0.944, dx: 0, dy: -0.204, fx: 'scan' },
  'hat.burning': { src: '/coin/art/hat.burning.webp', w: 0.815, dx: 0, dy: -0.512, fx: 'fire' },
  'hat.halo': { src: '/coin/art/hat.halo.webp', w: 0.728, dx: 0, dy: -0.62, fx: 'holy' },
  'hat.boss': { src: '/coin/art/hat.boss.webp', w: 0.989, dx: 0, dy: -0.537, fx: 'boss' },
};
