// 베팅 칸의 순수 계산 (node 시험용, DOM 없음). state = 방 상태, coins = 내가 가진 코인.
// 앉은 사람 = 연결된 입장 순서 앞 2명(서버 ready() 와 같다). 서버 규칙이 최종이고 이 값은 화면 안내/버튼 막기용.
export function betModel(state, coinsRaw) {
  const you = state?.you;
  const own = state?.wait?.own ?? {};
  const coins = Number.isInteger(coinsRaw) && coinsRaw > 0 ? coinsRaw : 0;
  const seated = (state?.players ?? []).filter((p) => p.connected !== false).slice(0, 2);
  const meSeated = seated.some((p) => p.id === you);
  const opp = seated.find((p) => p.id !== you) ?? null;
  const mine = Math.max(0, Number(own[you]?.bet) || 0);
  const oppBet = opp ? Math.max(0, Number(own[opp.id]?.bet) || 0) : 0;
  const canBet = Boolean(state?.wait) && meSeated;
  let note = '';
  let canMatch = false;
  if (!meSeated) note = '구경하는 사람은 코인을 걸 수 없어요';
  else if (!opp) note = '상대가 들어오면 걸 수 있어요';
  else if (mine === oppBet) note = mine ? `${mine} 코인을 걸었어요. 이긴 사람이 ${mine * 2} 코인을 가져가요` : '코인을 걸지 않는 판이에요';
  else if (oppBet > coins) note = '코인이 모자라 맞출 수 없어요';
  else note = '건 코인이 서로 달라요 (같게 맞추거나 둘 다 0)';
  if (canBet && opp && mine !== oppBet && oppBet <= coins) canMatch = true;
  return { coins, mine, oppBet, oppName: opp ? String(opp.name ?? '') : '', canBet, canMatch, note };
}
