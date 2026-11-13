import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampWidth, normalizeTool, currentWidth, widthPatch, quickIndex, stepWidth,
  widthToRatio, ratioToWidth, toolsVisible, buttonStates, isTypingTarget, keyAction,
} from '../../client/src/draw/ui/tools.pure.js';

test('clampWidth: 2~40 정수로 정리', () => {
  assert.equal(clampWidth(1), 2);
  assert.equal(clampWidth(99), 40);
  assert.equal(clampWidth(10.6), 11);
  assert.equal(clampWidth('abc', 7), 7);
  assert.equal(clampWidth(undefined, 7), 7);
});

test('normalizeTool: 빠진 칸을 기본값으로', () => {
  assert.deepEqual(normalizeTool(null), { tool: 'pen', color: 0, penW: 10, eraseW: 24 });
  assert.equal(normalizeTool({ tool: 'x', color: 12 }).tool, 'pen');
  assert.equal(normalizeTool({ color: 12 }).color, 0);
  assert.equal(normalizeTool({ color: 11, penW: 4 }).color, 11);
});

test('굵기는 펜과 정밀 지우개가 따로, 획 지우개는 없음', () => {
  const t = normalizeTool({ tool: 'erase', penW: 6, eraseW: 30 });
  assert.equal(currentWidth(t), 30);
  assert.deepEqual(widthPatch(t, 12), { eraseW: 12 });
  const p = normalizeTool({ tool: 'pen', penW: 6 });
  assert.deepEqual(widthPatch(p, 50), { penW: 40 });
  const s = normalizeTool({ tool: 'strokeErase' });
  assert.equal(currentWidth(s), null);
  assert.equal(widthPatch(s, 5), null);
});

test('quickIndex / stepWidth / 막대 비율', () => {
  assert.equal(quickIndex(4), 0);
  assert.equal(quickIndex(10), 1);
  assert.equal(quickIndex(24), 2);
  assert.equal(quickIndex(11), -1);
  assert.equal(quickIndex(null), -1);
  assert.equal(stepWidth(2, -1), 2);
  assert.equal(stepWidth(40, 1), 40);
  assert.equal(stepWidth(10, 1), 11);
  assert.equal(ratioToWidth(0), 2);
  assert.equal(ratioToWidth(1), 40);
  assert.equal(ratioToWidth(-3), 2);
  assert.equal(ratioToWidth(0.5), 21);
  assert.equal(widthToRatio(2), 0);
  assert.equal(widthToRatio(40), 1);
});

test('보이는 때: 내가 그리는 사람 + draw 단계', () => {
  const s = { phase: 'draw', drawerId: 'a', canUndo: true, canRedo: false };
  assert.equal(toolsVisible(s, 'a'), true);
  assert.equal(toolsVisible(s, 'b'), false);
  assert.equal(toolsVisible({ ...s, phase: 'pick' }, 'a'), false);
  assert.equal(toolsVisible(null, 'a'), false);
  assert.equal(toolsVisible({ phase: 'draw', drawerId: null }, null), false);
});

test('buttonStates: undo/redo 는 history 따라(없으면 켬), 획 지우개면 굵기 끔', () => {
  const s = { phase: 'draw', drawerId: 'a', canUndo: false, canRedo: false };
  const pen = normalizeTool({});
  assert.deepEqual(buttonStates(s, pen, 'a', { canUndo: true, canRedo: false }), { visible: true, undo: true, redo: false, sizes: true });
  assert.deepEqual(buttonStates(s, pen, 'a'), { visible: true, undo: true, redo: true, sizes: true });
  assert.equal(buttonStates(s, normalizeTool({ tool: 'strokeErase' }), 'a', null).sizes, false);
  assert.deepEqual(buttonStates(s, pen, 'b'), { visible: false, undo: false, redo: false, sizes: false });
});

test('isTypingTarget', () => {
  assert.equal(isTypingTarget({ tagName: 'INPUT' }), true);
  assert.equal(isTypingTarget({ tagName: 'textarea' }), true);
  assert.equal(isTypingTarget({ tagName: 'DIV', isContentEditable: true }), true);
  assert.equal(isTypingTarget({ tagName: 'BUTTON' }), false);
  assert.equal(isTypingTarget(null), false);
});

test('keyAction: 단축키 표', () => {
  assert.deepEqual(keyAction({ code: 'KeyB', key: 'b' }), { a: 'tool', tool: 'pen' });
  assert.deepEqual(keyAction({ code: 'KeyE', key: 'e' }), { a: 'tool', tool: 'erase' });
  assert.deepEqual(keyAction({ code: 'KeyE', key: 'E', shiftKey: true }), { a: 'tool', tool: 'strokeErase' });
  assert.deepEqual(keyAction({ code: 'Digit1', key: '1' }), { a: 'quick', i: 0 });
  assert.deepEqual(keyAction({ code: 'Digit3', key: '3' }), { a: 'quick', i: 2 });
  assert.equal(keyAction({ code: 'Digit4', key: '4' }), null);
  assert.deepEqual(keyAction({ code: 'BracketLeft', key: '[' }), { a: 'step', d: -1 });
  assert.deepEqual(keyAction({ code: 'BracketRight', key: ']' }), { a: 'step', d: 1 });
  assert.deepEqual(keyAction({ code: 'KeyZ', key: 'z', ctrlKey: true }), { a: 'undo' });
  assert.deepEqual(keyAction({ code: 'KeyZ', key: 'z', metaKey: true }), { a: 'undo' });
  assert.deepEqual(keyAction({ code: 'KeyZ', key: 'Z', ctrlKey: true, shiftKey: true }), { a: 'redo' });
  assert.deepEqual(keyAction({ code: 'KeyZ', key: 'Z', metaKey: true, shiftKey: true }), { a: 'redo' });
  assert.deepEqual(keyAction({ code: 'KeyY', key: 'y', ctrlKey: true }), { a: 'redo' });
});

test('keyAction: 한글 자판(key 가 ㅠ)이어도 code 로 동작', () => {
  assert.deepEqual(keyAction({ code: 'KeyB', key: 'ㅠ' }), { a: 'tool', tool: 'pen' });
  assert.deepEqual(keyAction({ code: 'KeyZ', key: 'ㅋ', ctrlKey: true }), { a: 'undo' });
});

test('keyAction: 무시하는 경우', () => {
  assert.equal(keyAction({ code: 'KeyB', key: 'b' }, true), null); // 글 쓰는 중
  assert.equal(keyAction({ code: 'KeyB', key: 'b', altKey: true }), null);
  assert.equal(keyAction({ code: 'KeyB', key: 'b', ctrlKey: true }), null);
  assert.equal(keyAction({ code: 'KeyX', key: 'x' }), null);
  assert.equal(keyAction({ code: 'KeyY', key: 'y', ctrlKey: true, shiftKey: true }), null);
  assert.equal(keyAction({ code: 'Digit1', key: '!', shiftKey: true }), null);
  assert.equal(keyAction(null), null);
});
