// 종목 겉모습 표(meta.js)와 엔진 표(index.js)가 같고, 가벼운 파일이 엔진을 끌어오지 않는지 검사
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { META, IDS } from '../../shared/solo/meta.js';
import { SOLO } from '../../shared/solo/index.js';
import { BOARDS } from '../../client/src/solo/games.js';

test('meta 표와 엔진 표: 같은 순서·같은 id·이름·설명', () => {
  assert.deepEqual(Object.keys(SOLO), IDS);
  for (const m of META) {
    assert.equal(SOLO[m.id].id, m.id);
    assert.equal(SOLO[m.id].name, m.name);
    assert.equal(SOLO[m.id].desc, m.desc);
  }
});

test('판 화면 표에 모든 종목이 있다', () => {
  assert.deepEqual(Object.keys(BOARDS), IDS);
});

test('공용 등록표·설정은 엔진(index.js)을 직접 부르지 않는다', () => {
  for (const f of ['shared/games.js', 'shared/solo/settings.js', 'client/src/ui/lobby.js', 'client/src/ui/admin.js']) {
    const src = readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /solo\/index\.js|from '\.\/index\.js'/, f);
  }
});
