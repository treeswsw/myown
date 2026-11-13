// 규칙 안내 창 (CONTRACTS 6절 rules, GDD 7-1 "규칙 안내"). 다른 모듈·CSS·shared 를 가져오지 않는다.
// 맨 위(불러오는 순간)에는 document·window 를 만지지 않는다. 역할과 무관: state.my·unmask·result 를 읽지 않는다.

// 순수 함수. 내용은 GDD 7-1 의 글 그대로. settings.liarMode 인 쪽에 here:true.
export function ruleSections(settings) {
  const mode = settings && settings.liarMode;
  return [
    {
      title: '진행 순서',
      lines: [
        '제시어를 확인한다(카드를 누르고 있는 동안만 보임)',
        '한 명씩 차례대로 제시어를 한 줄로 설명한다',
        '다 같이 이야기하며 라이어 같은 사람을 누른다',
        '가장 많이 찍힌 사람이 최후 변론을 하고, 나머지가 "맞다 / 아니다"를 고른다. 시간 안에 안 고르면 기권',
        '"맞다"가 더 많으면 처형되고 정체가 공개된다. 아니면 살려 주고 다시 3번으로',
        '라이어가 밝혀지면 라이어는 제시어를 맞혀 볼 기회를 한 번 얻는다',
      ],
    },
    {
      title: '라이어 방식',
      lines: [
        { v: 'word', head: '다른 제시어', text: '라이어는 비슷하지만 다른 단어를 받는다. 자신이 라이어인지 모른다.', here: mode === 'word' },
        { v: 'notice', head: '라이어 알림', text: '라이어는 자신이 라이어인 것을 알고, 주제만 알고 단어는 모른다.', here: mode === 'notice' },
      ],
    },
    {
      title: '점수표',
      table: {
        liar: [
          ['안 들키고 정답', '+3'],
          ['안 들킴', '+1'],
          ['들켰지만 정답', '+1'],
          ['들키고 오답', '0'],
        ],
        citizen: {
          cols: ['"맞다"', '"아니다"'],
          rows: [
            { label: '라이어를 처형', cells: ['+2', '+1'] },
            { label: '시민을 처형', cells: ['−1', '0'] },
            { label: '기권', cells: ['0', '0'] },
          ],
        },
        note: '살려 준 투표는 점수에 들어가지 않아요.',
      },
    },
  ];
}

const el = (tag, cls, attrs) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (attrs) for (const k of Object.keys(attrs)) e.setAttribute(k, attrs[k]);
  return e;
};
const txt = (tag, cls, s) => { const e = el(tag, cls); e.textContent = s; return e; };

export function createRules(ctx) {
  const root = el('div', 'lg-rule-root');
  root.hidden = true;
  const btn = el('button', 'lg-rule-btn', {
    type: 'button', 'data-lg': 'rule-open', 'aria-expanded': 'false', 'aria-controls': 'lg-rule-panel', 'aria-label': '규칙 보기',
  });
  btn.append(txt('span', 'lg-rule-ico', '📖'), txt('span', 'lg-rule-label', '규칙'));
  btn.firstChild.setAttribute('aria-hidden', 'true');

  const panel = el('section', 'lg-rule-panel', { id: 'lg-rule-panel', 'data-lg': 'rule-panel', 'aria-label': '규칙 안내' });
  panel.hidden = true;
  const head = el('div', 'lg-rule-head');
  const close = el('button', 'lg-rule-close', { type: 'button', 'data-lg': 'rule-close', 'aria-label': '닫기' });
  close.textContent = '×';
  head.append(txt('h2', null, '규칙 안내'), close);
  const body = el('div', 'lg-rule-body');
  panel.append(head, body);
  root.append(btn, panel);
  ctx.root.appendChild(root);

  let open = false;
  let built = '';

  function build(settings) {
    const key = String((settings && settings.liarMode) || '');
    if (key === built && body.childNodes.length) return;
    built = key;
    body.replaceChildren(...ruleSections(settings).map((sec) => {
      const box = el('div', 'lg-rule-sec');
      box.appendChild(txt('h3', 'lg-rule-title', sec.title));
      if (sec.table) {
        const t = sec.table;
        const g1 = el('div', 'lg-rule-grp');
        g1.appendChild(txt('b', 'lg-rule-who', '라이어'));
        const l1 = el('div', 'lg-rule-lscores');
        for (const [lab, val] of t.liar) {
          const c = el('span', 'lg-rule-cell');
          c.append(txt('span', null, lab), txt('b', 'lg-rule-pt', val));
          l1.appendChild(c);
        }
        g1.appendChild(l1);
        const g2 = el('div', 'lg-rule-grp');
        g2.appendChild(txt('b', 'lg-rule-who', '시민'));
        const tb = el('table', 'lg-rule-tbl');
        const hr = el('tr');
        hr.append(el('th'), ...t.citizen.cols.map((c) => txt('th', null, c)));
        tb.appendChild(hr);
        for (const r of t.citizen.rows) {
          const tr = el('tr');
          tr.append(txt('th', null, r.label), ...r.cells.map((c) => txt('td', 'lg-rule-pt', c)));
          tb.appendChild(tr);
        }
        g2.appendChild(tb);
        box.append(g1, g2, txt('p', 'lg-rule-note', t.note));
      } else if (sec.title === '라이어 방식') {
        const ul = el('ul', 'lg-rule-modes');
        for (const m of sec.lines) {
          const li = el('li', 'lg-rule-mode', { 'data-v': m.v });
          if (m.here) li.setAttribute('aria-current', 'true');
          const h = el('b', 'lg-rule-mhead');
          h.textContent = m.head;
          li.append(h);
          if (m.here) {
            const badge = txt('span', 'lg-rule-here', '이 방');
            badge.setAttribute('data-lg', 'rule-mode');
            badge.setAttribute('data-v', m.v);
            li.append(badge);
          }
          li.append(txt('span', 'lg-rule-mtext', m.text));
          ul.appendChild(li);
        }
        box.appendChild(ul);
      } else {
        const ol = el('ol', 'lg-rule-steps');
        for (const s of sec.lines) ol.appendChild(txt('li', null, s));
        box.appendChild(ol);
      }
      return box;
    }));
  }

  const setOpen = (v) => {
    open = !!v;
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? '규칙 닫기' : '규칙 보기');
  };

  btn.addEventListener('click', () => setOpen(!open));
  close.addEventListener('click', () => { setOpen(false); btn.focus(); });
  const onDown = (e) => {
    if (open && !panel.contains(e.target) && !btn.contains(e.target)) setOpen(false);
  };
  const onKey = (e) => {
    if (open && e.key === 'Escape') { setOpen(false); btn.focus(); }
  };
  document.addEventListener('pointerdown', onDown, true);
  document.addEventListener('keydown', onKey);

  return {
    el: root,
    update(s) {
      const on = !!s && s.phase !== 'unmask';
      if (!on) { if (open) setOpen(false); root.hidden = true; return; }
      root.hidden = false;
      build(s.settings);
    },
    dispose() {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
      root.remove();
    },
  };
}
