// 머리 위 이모티콘 시험용 가짜 상태 (GDD 9-3 의 players 일부만)
export function fixture(name, n = 8) {
  const players = Array.from({ length: n }, (_, i) => ({ id: 'u' + i, name: '사람' + i, color: '#c33', seat: i }));
  return { phase: name, you: 'u0', players, phaseEndsAt: null };
}
