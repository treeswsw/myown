// 준비중 자리(SPEC 22-19). 실제 화면이 오면 이 파일을 통째로 바꾼다.
export function openLook(ctx) {
  ctx.root.append(Object.assign(document.createElement('div'), { className: 'cn-toast cn-show', textContent: '준비중입니다.' }));
}
