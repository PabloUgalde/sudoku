const STORAGE_KEY = 'sudoku_game_v1';
const PREFS_KEY = 'sudoku_prefs_v1';
const DIFFICULTY_LABELS = { easy: 'Fácil', medium: 'Medio', hard: 'Difícil', expert: 'Experto' };
const COLOR_NAMES = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];
const COLOR_HEX = {
  red: 'rgba(239, 68, 68, .5)',
  orange: 'rgba(249, 115, 22, .5)',
  yellow: 'rgba(234, 179, 8, .5)',
  green: 'rgba(34, 197, 94, .5)',
  blue: 'rgba(59, 130, 246, .5)',
  purple: 'rgba(168, 85, 247, .5)',
};

const state = {
  board: [],
  solution: [],
  difficulty: 'medium',
  selected: new Set(),
  anchor: null,
  highlightDigit: 0,
  wrongCells: new Set(),
  notesMode: false,
  digitFirst: false,
  armedTool: null,
  past: [],
  future: [],
  elapsed: 0,
  timerId: null,
  paused: false,
  solved: false,
};

let dragging = false;
let dragVisited = null;
let cellRefs = [];
let recentlySelectedIdx = null;

const boardEl = document.getElementById('board');
const timerEl = document.getElementById('timer');
const difficultySelect = document.getElementById('difficulty');
const btnNew = document.getElementById('btn-new');
const btnUndo = document.getElementById('btn-undo');
const btnRedo = document.getElementById('btn-redo');
const btnCheck = document.getElementById('btn-check');
const btnAutoNotes = document.getElementById('btn-autonotes');
const btnNotes = document.getElementById('btn-notes');
const btnDigitFirst = document.getElementById('btn-digitfirst');
const btnPause = document.getElementById('btn-pause');
const btnResume = document.getElementById('btn-resume');
const pauseOverlay = document.getElementById('pause-overlay');
const winOverlay = document.getElementById('win-overlay');
const winTimeEl = document.getElementById('win-time');
const winDifficultyEl = document.getElementById('win-difficulty');
const btnWinNew = document.getElementById('btn-win-new');
const palette = document.getElementById('palette');
const btnClearColors = document.getElementById('btn-clear-colors');
const numpad = document.getElementById('numpad');

function isBlocked() {
  return state.paused || state.solved;
}

function newBoardFromPuzzle(givens) {
  return givens.map((v) => ({ given: v !== 0, value: v, notes: new Set(), colors: new Set() }));
}

function snapshotBoard(board) {
  return board.map((c) => ({ given: c.given, value: c.value, notes: [...c.notes], colors: [...c.colors] }));
}

function restoreBoard(snap) {
  return snap.map((c) => ({ given: c.given, value: c.value, notes: new Set(c.notes), colors: new Set(c.colors) }));
}

function recordHistory() {
  state.past.push(snapshotBoard(state.board));
  if (state.past.length > 200) state.past.shift();
  state.future = [];
}

function undo() {
  if (!state.past.length) return;
  state.future.push(snapshotBoard(state.board));
  state.board = restoreBoard(state.past.pop());
  afterMutation();
}

function redo() {
  if (!state.future.length) return;
  state.past.push(snapshotBoard(state.board));
  state.board = restoreBoard(state.future.pop());
  afterMutation();
}

function isSameTool(a, b) {
  if (!a || !b) return false;
  if (a.type !== b.type) return false;
  if (a.type === 'value') return a.n === b.n;
  if (a.type === 'color') return a.c === b.c;
  return true;
}

function peersOf(idx) {
  const r = Math.floor(idx / 9), c = idx % 9, b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
  const result = [];
  for (let i = 0; i < 81; i++) {
    if (i === idx) continue;
    const r2 = Math.floor(i / 9), c2 = i % 9, b2 = Math.floor(r2 / 3) * 3 + Math.floor(c2 / 3);
    if (r2 === r || c2 === c || b2 === b) result.push(i);
  }
  return result;
}

function applyTool(tool, idx) {
  const cell = state.board[idx];
  switch (tool.type) {
    case 'value':
      if (cell.given) return;
      if (state.notesMode) {
        if (cell.notes.has(tool.n)) cell.notes.delete(tool.n);
        else cell.notes.add(tool.n);
      } else {
        cell.value = cell.value === tool.n ? 0 : tool.n;
        if (cell.value !== 0) {
          cell.notes.clear();
          peersOf(idx).forEach((p) => state.board[p].notes.delete(cell.value));
        }
      }
      break;
    case 'erase':
      if (cell.given) return;
      cell.value = 0;
      cell.notes.clear();
      break;
    case 'color':
      if (cell.colors.has(tool.c)) cell.colors.delete(tool.c);
      else cell.colors.add(tool.c);
      break;
    case 'clear-color':
      cell.colors.clear();
      break;
  }
}

function colorLayerBackground(colors) {
  const list = COLOR_NAMES.filter((c) => colors.has(c));
  if (!list.length) return 'transparent';
  if (list.length === 1) return COLOR_HEX[list[0]];
  const step = 100 / list.length;
  const stops = list.map((c, i) => `${COLOR_HEX[c]} ${i * step}% ${(i + 1) * step}%`).join(', ');
  return `linear-gradient(135deg, ${stops})`;
}

function applyToolToSelection(tool) {
  if (!state.selected.size) return;
  recordHistory();
  state.selected.forEach((idx) => applyTool(tool, idx));
  afterMutation();
}

function handleToolButtonClick(tool) {
  if (isBlocked()) return;
  if (state.digitFirst) {
    if (isSameTool(state.armedTool, tool)) {
      state.armedTool = state.highlightDigit ? { type: 'value', n: state.highlightDigit } : null;
    } else {
      state.armedTool = tool;
    }
    updateArmedUI();
  } else {
    applyToolToSelection(tool);
  }
}

function numberButtonClicked(n) {
  if (isBlocked()) return;
  const tool = { type: 'value', n };
  if (state.digitFirst) {
    const nowArmed = !isSameTool(state.armedTool, tool);
    state.armedTool = nowArmed ? tool : null;
    state.highlightDigit = nowArmed ? n : 0;
  } else {
    state.highlightDigit = state.highlightDigit === n ? 0 : n;
    applyToolToSelection(tool);
  }
  updateArmedUI();
  renderHighlights();
}

function selectCell(idx, extend) {
  if (extend) {
    if (state.selected.has(idx)) state.selected.delete(idx);
    else state.selected.add(idx);
    state.anchor = idx;
    recentlySelectedIdx = null;
  } else if (recentlySelectedIdx === idx && state.selected.size === 1 && state.selected.has(idx)) {
    state.selected = new Set();
    state.anchor = null;
    state.highlightDigit = 0;
    recentlySelectedIdx = null;
  } else {
    state.selected = new Set([idx]);
    state.highlightDigit = state.board[idx].value;
    state.anchor = idx;
    recentlySelectedIdx = idx;
  }
  updateArmedUI();
  renderHighlights();
}

function cellFromPoint(x, y) {
  const el = document.elementFromPoint(x, y);
  const cellEl = el && el.closest ? el.closest('.cell') : null;
  return cellEl ? Number(cellEl.dataset.index) : null;
}

function onBoardPointerDown(e) {
  if (isBlocked()) return;
  const cellEl = e.target.closest('.cell');
  if (!cellEl) return;
  const idx = Number(cellEl.dataset.index);
  if (state.digitFirst && state.armedTool) {
    recordHistory();
    dragging = true;
    dragVisited = new Set([idx]);
    applyTool(state.armedTool, idx);
    afterMutation();
    boardEl.setPointerCapture(e.pointerId);
  } else {
    selectCell(idx, e.ctrlKey || e.metaKey || e.shiftKey);
  }
}

function onBoardPointerMove(e) {
  if (!dragging) return;
  const idx = cellFromPoint(e.clientX, e.clientY);
  if (idx === null || dragVisited.has(idx)) return;
  dragVisited.add(idx);
  applyTool(state.armedTool, idx);
  afterMutation();
}

function onBoardPointerUp() {
  dragging = false;
  dragVisited = null;
}

function moveAnchor(key) {
  const idx = state.anchor ?? 0;
  let r = Math.floor(idx / 9);
  let c = idx % 9;
  if (key === 'ArrowUp') r = Math.max(0, r - 1);
  if (key === 'ArrowDown') r = Math.min(8, r + 1);
  if (key === 'ArrowLeft') c = Math.max(0, c - 1);
  if (key === 'ArrowRight') c = Math.min(8, c + 1);
  selectCell(r * 9 + c, false);
}

function onKeyDown(e) {
  if (e.key.startsWith('Arrow')) {
    e.preventDefault();
    moveAnchor(e.key);
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    redo();
    return;
  }
  if (e.key === 'n' || e.key === 'N') { btnNotes.click(); return; }
  if (e.key === 'd' || e.key === 'D') { btnDigitFirst.click(); return; }
  if (isBlocked()) return;
  if (e.key >= '1' && e.key <= '9') {
    const n = Number(e.key);
    state.highlightDigit = state.highlightDigit === n ? 0 : n;
    applyToolToSelection({ type: 'value', n });
    updateArmedUI();
    renderHighlights();
  } else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
    applyToolToSelection({ type: 'erase' });
  }
}

function createBoardDOM() {
  boardEl.innerHTML = '';
  cellRefs = [];
  for (let i = 0; i < 81; i++) {
    const r = Math.floor(i / 9);
    const cellEl = document.createElement('div');
    cellEl.className = 'cell';
    cellEl.dataset.index = String(i);
    if (r === 2 || r === 5) cellEl.classList.add('border-bottom-thick');

    const colorLayer = document.createElement('div');
    colorLayer.className = 'cell-color-layer';

    const valueEl = document.createElement('div');
    valueEl.className = 'cell-value';

    const notesEl = document.createElement('div');
    notesEl.className = 'cell-notes';
    const noteSpans = [];
    for (let n = 1; n <= 9; n++) {
      const span = document.createElement('span');
      notesEl.appendChild(span);
      noteSpans.push(span);
    }

    cellEl.append(colorLayer, valueEl, notesEl);
    boardEl.appendChild(cellEl);
    cellRefs.push({ el: cellEl, colorLayer, valueEl, notesEl, noteSpans });
  }
}

function renderBoard() {
  const values = state.board.map((c) => c.value);
  const conflicts = Sudoku.findConflicts(values);
  for (let i = 0; i < 81; i++) {
    const cell = state.board[i];
    const ref = cellRefs[i];
    ref.el.classList.toggle('given', cell.given);
    ref.el.classList.toggle('filled', !cell.given && cell.value !== 0);
    ref.el.classList.toggle('conflict', conflicts.has(i));
    ref.colorLayer.style.background = colorLayerBackground(cell.colors);

    if (cell.value) {
      ref.valueEl.textContent = String(cell.value);
      ref.notesEl.style.display = 'none';
      ref.el.classList.remove('has-notes');
    } else {
      ref.valueEl.textContent = '';
      ref.notesEl.style.display = '';
      ref.el.classList.toggle('has-notes', cell.notes.size > 0);
      for (let n = 1; n <= 9; n++) {
        ref.noteSpans[n - 1].textContent = cell.notes.has(n) ? String(n) : '';
      }
    }
  }
}

function renderHighlights() {
  const anchor = state.anchor;
  const hd = state.highlightDigit;
  let r1 = -1, c1 = -1, b1 = -1;
  if (anchor != null) {
    r1 = Math.floor(anchor / 9);
    c1 = anchor % 9;
    b1 = Math.floor(r1 / 3) * 3 + Math.floor(c1 / 3);
  }
  for (let i = 0; i < 81; i++) {
    const cell = state.board[i];
    const ref = cellRefs[i];
    const isSelected = state.selected.has(i);
    ref.el.classList.toggle('selected', isSelected);
    let isPeer = false;
    if (anchor != null && i !== anchor) {
      const r2 = Math.floor(i / 9), c2 = i % 9, b2 = Math.floor(r2 / 3) * 3 + Math.floor(c2 / 3);
      isPeer = r1 === r2 || c1 === c2 || b1 === b2;
    }
    ref.el.classList.toggle('peer', isPeer && !isSelected);
    ref.el.classList.toggle('same-value', hd !== 0 && cell.value === hd);
    ref.el.classList.toggle('note-match', hd !== 0 && cell.value === 0 && cell.notes.has(hd));
    ref.el.classList.toggle('wrong', state.wrongCells.has(i));
    for (let n = 1; n <= 9; n++) {
      ref.noteSpans[n - 1].classList.toggle('hl', hd === n && cell.notes.has(n));
    }
  }
}

function renderNumpadBadges() {
  const counts = new Array(10).fill(0);
  state.board.forEach((c) => { if (c.value) counts[c.value]++; });
  for (let n = 1; n <= 9; n++) {
    const btn = numpad.querySelector(`.num-btn[data-num="${n}"]`);
    btn.querySelector('.num-badge').textContent = String(counts[n]);
    btn.classList.toggle('depleted', counts[n] >= 9);
  }
}

function updateUndoRedoButtons() {
  btnUndo.disabled = !state.past.length;
  btnRedo.disabled = !state.future.length;
}

function updateArmedUI() {
  numpad.querySelectorAll('.num-btn[data-num]').forEach((btn) => {
    const n = Number(btn.dataset.num);
    if (n === 0) {
      btn.classList.toggle('active', state.digitFirst && isSameTool(state.armedTool, { type: 'erase' }));
      return;
    }
    btn.classList.toggle('active', state.highlightDigit === n);
  });
  palette.querySelectorAll('.swatch').forEach((btn) => {
    const c = btn.dataset.color;
    const tool = c ? { type: 'color', c } : { type: 'clear-color' };
    btn.classList.toggle('active', state.digitFirst && isSameTool(state.armedTool, tool));
  });
}

function renderAll() {
  renderBoard();
  renderHighlights();
  renderNumpadBadges();
  updateUndoRedoButtons();
}

function revalidateWrongCells() {
  if (!state.wrongCells.size) return;
  const stillWrong = new Set();
  state.wrongCells.forEach((i) => {
    const cell = state.board[i];
    if (!cell.given && cell.value !== 0 && cell.value !== state.solution[i]) {
      stillWrong.add(i);
    }
  });
  state.wrongCells = stillWrong;
}

function afterMutation() {
  recentlySelectedIdx = null;
  revalidateWrongCells();
  renderAll();
  checkWin();
  saveGame();
}

function checkAnswers() {
  if (isBlocked()) return;
  state.wrongCells.clear();
  state.board.forEach((cell, i) => {
    if (!cell.given && cell.value !== 0 && cell.value !== state.solution[i]) {
      state.wrongCells.add(i);
    }
  });
  renderHighlights();
}

function clearAllColors() {
  if (isBlocked()) return;
  const hasAny = state.board.some((c) => c.colors.size);
  if (!hasAny) return;
  recordHistory();
  state.board.forEach((c) => c.colors.clear());
  afterMutation();
}

function autoFillNotes() {
  if (isBlocked()) return;
  recordHistory();
  for (let i = 0; i < 81; i++) {
    const cell = state.board[i];
    if (cell.value !== 0) continue;
    const candidates = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    peersOf(i).forEach((p) => candidates.delete(state.board[p].value));
    cell.notes = candidates;
  }
  afterMutation();
}

function checkWin() {
  if (state.solved) return;
  const values = state.board.map((c) => c.value);
  if (values.every((v) => v !== 0) && Sudoku.findConflicts(values).size === 0) {
    state.solved = true;
    winDifficultyEl.textContent = `🎯 ${DIFFICULTY_LABELS[state.difficulty] || ''}`;
    winTimeEl.textContent = `⏱ ${formatTime(state.elapsed)}`;
    winOverlay.classList.remove('hidden');
  }
}

function formatTime(total) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function startTimer() {
  if (state.timerId) clearInterval(state.timerId);
  timerEl.textContent = formatTime(state.elapsed);
  state.timerId = setInterval(() => {
    if (state.paused || state.solved) return;
    state.elapsed++;
    timerEl.textContent = formatTime(state.elapsed);
    if (state.elapsed % 5 === 0) saveGame();
  }, 1000);
}

function startNewGame(difficulty) {
  if (state.past.length && !state.solved) {
    if (!confirm('¿Empezar una partida nueva? Perderás el progreso actual.')) return;
  }
  btnNew.disabled = true;
  btnNew.textContent = 'Generando…';
  setTimeout(() => {
    const { givens, solution } = Sudoku.generatePuzzle(difficulty);
    state.board = newBoardFromPuzzle(givens);
    state.solution = solution;
    state.difficulty = difficulty;
    state.selected = new Set();
    state.anchor = null;
    state.highlightDigit = 0;
    state.wrongCells.clear();
    state.past = [];
    state.future = [];
    state.armedTool = null;
    state.elapsed = 0;
    state.solved = false;
    state.paused = false;
    updateArmedUI();
    winOverlay.classList.add('hidden');
    pauseOverlay.classList.remove('active');
    renderAll();
    startTimer();
    saveGame();
    btnNew.disabled = false;
    btnNew.textContent = 'Nueva partida';
  }, 30);
}

function saveGame() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      board: snapshotBoard(state.board),
      solution: state.solution,
      difficulty: state.difficulty,
      elapsed: state.elapsed,
      solved: state.solved,
    }));
  } catch (e) { /* localStorage no disponible */ }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data.board || data.board.length !== 81) return false;
    state.board = restoreBoard(data.board);
    state.solution = data.solution || [];
    state.difficulty = data.difficulty || 'medium';
    state.elapsed = data.elapsed || 0;
    state.solved = !!data.solved;
    return true;
  } catch (e) {
    return false;
  }
}

function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ digitFirst: state.digitFirst, notesMode: state.notesMode }));
  } catch (e) { /* localStorage no disponible */ }
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    state.digitFirst = !!data.digitFirst;
    state.notesMode = !!data.notesMode;
  } catch (e) { /* localStorage no disponible */ }
}

function wireEvents() {
  numpad.querySelectorAll('.num-btn[data-num]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const n = Number(btn.dataset.num);
      if (n === 0) handleToolButtonClick({ type: 'erase' });
      else numberButtonClicked(n);
    });
  });

  palette.querySelectorAll('.swatch').forEach((btn) => {
    btn.addEventListener('click', () => {
      const c = btn.dataset.color;
      handleToolButtonClick(c ? { type: 'color', c } : { type: 'clear-color' });
    });
  });

  boardEl.addEventListener('pointerdown', onBoardPointerDown);
  boardEl.addEventListener('pointermove', onBoardPointerMove);
  window.addEventListener('pointerup', onBoardPointerUp);
  window.addEventListener('pointercancel', onBoardPointerUp);
  document.addEventListener('keydown', onKeyDown);

  btnNotes.addEventListener('click', () => {
    state.notesMode = !state.notesMode;
    btnNotes.classList.toggle('active', state.notesMode);
    savePrefs();
  });

  btnDigitFirst.addEventListener('click', () => {
    state.digitFirst = !state.digitFirst;
    if (!state.digitFirst) state.armedTool = null;
    btnDigitFirst.classList.toggle('active', state.digitFirst);
    updateArmedUI();
    savePrefs();
  });

  btnUndo.addEventListener('click', undo);
  btnRedo.addEventListener('click', redo);
  btnCheck.addEventListener('click', checkAnswers);
  btnClearColors.addEventListener('click', clearAllColors);
  btnAutoNotes.addEventListener('click', autoFillNotes);

  btnNew.addEventListener('click', () => startNewGame(difficultySelect.value));
  btnWinNew.addEventListener('click', () => startNewGame(difficultySelect.value));

  btnPause.addEventListener('click', () => {
    if (state.solved) return;
    state.paused = true;
    pauseOverlay.classList.add('active');
    saveGame();
  });
  btnResume.addEventListener('click', () => {
    state.paused = false;
    pauseOverlay.classList.remove('active');
  });
}

function init() {
  createBoardDOM();
  loadPrefs();
  btnNotes.classList.toggle('active', state.notesMode);
  btnDigitFirst.classList.toggle('active', state.digitFirst);
  wireEvents();

  if (loadGame()) {
    difficultySelect.value = state.difficulty;
    renderAll();
    startTimer();
  } else {
    startNewGame(difficultySelect.value);
  }
}

init();
