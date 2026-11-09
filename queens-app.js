const Q_STORAGE_KEY = 'queens_game_v1';
const EMPTY = 0, MARK = 1, QUEEN = 2;

const state = {
  n: 7,
  regions: [],
  solution: [],
  cells: [],          // 0 vacía, 1 ✕, 2 reina
  past: [],
  future: [],
  tool: null,         // null = toque cíclico; 'x' | 'queen' | 'erase' = herramienta armada
  wrong: new Set(),
  hints: 0,
  elapsed: 0,
  timerId: null,
  paused: false,
  solved: false,
};

let cellEls = [];
let drag = null;      // { value, from: [valores que se pueden pisar], before, recorded }

const boardEl = document.getElementById('board');
const timerEl = document.getElementById('timer');
const warnEl = document.getElementById('warn');
const sizeSelect = document.getElementById('size');
const btnNew = document.getElementById('btn-new');
const btnUndo = document.getElementById('btn-undo');
const btnRedo = document.getElementById('btn-redo');
const btnCheck = document.getElementById('btn-check');
const btnAutoX = document.getElementById('btn-autox');
const btnHint = document.getElementById('btn-hint');
const btnClearX = document.getElementById('btn-clear-x');
const btnPause = document.getElementById('btn-pause');
const btnResume = document.getElementById('btn-resume');
const pauseOverlay = document.getElementById('pause-overlay');
const winOverlay = document.getElementById('win-overlay');
const winSizeEl = document.getElementById('win-size');
const winTimeEl = document.getElementById('win-time');
const btnWinNew = document.getElementById('btn-win-new');
const toolsEl = document.getElementById('tools');

const isBlocked = () => state.paused || state.solved;
const rowOf = (i) => Math.floor(i / state.n);
const colOf = (i) => i % state.n;
const isSolutionCell = (i) => state.solution[rowOf(i)] === colOf(i);

// ---------- Historial ----------
function recordHistory(snapshot) {
  state.past.push(snapshot || state.cells.slice());
  if (state.past.length > 300) state.past.shift();
  state.future = [];
}

function undo() {
  if (isBlocked() || !state.past.length) return;
  state.future.push(state.cells.slice());
  state.cells = state.past.pop();
  afterMutation();
}

function redo() {
  if (isBlocked() || !state.future.length) return;
  state.past.push(state.cells.slice());
  state.cells = state.future.pop();
  afterMutation();
}

// ---------- Tablero ----------
function createBoardDOM() {
  const n = state.n;
  boardEl.innerHTML = '';
  boardEl.style.setProperty('--n', n);
  boardEl.style.gridTemplateColumns = `repeat(${n}, minmax(0, 1fr))`;
  boardEl.style.gridTemplateRows = `repeat(${n}, minmax(0, 1fr))`;
  cellEls = [];
  for (let i = 0; i < n * n; i++) {
    const r = rowOf(i), c = colOf(i), z = state.regions[i];
    const el = document.createElement('div');
    el.className = 'q-cell';
    el.dataset.index = String(i);
    el.style.background = `var(--qz${z})`;
    // borde grueso solo donde cambia la zona de color
    const edge = (j) => (state.regions[j] !== z ? '1px' : '0');
    el.style.borderTopWidth = r === 0 ? '0' : edge(i - n);
    el.style.borderBottomWidth = r === n - 1 ? '0' : edge(i + n);
    el.style.borderLeftWidth = c === 0 ? '0' : edge(i - 1);
    el.style.borderRightWidth = c === n - 1 ? '0' : edge(i + 1);
    boardEl.appendChild(el);
    cellEls.push(el);
  }
}

function findConflicts() {
  const queens = [], bad = new Set();
  state.cells.forEach((v, i) => { if (v === QUEEN) queens.push(i); });
  for (let a = 0; a < queens.length; a++) {
    for (let b = a + 1; b < queens.length; b++) {
      if (Queens.attacks(queens[a], queens[b], state.n, state.regions)) { bad.add(queens[a]); bad.add(queens[b]); }
    }
  }
  return { queens, bad };
}

// Zonas, filas o columnas sin reina donde ya no cabe ninguna: todas sus celdas quedan
// bloqueadas por las reinas puestas. Las ✕ no cuentan, porque podrían estar equivocadas.
function findDeadEnds(queens) {
  const n = state.n;
  const blocked = (i) => queens.some((q) => Queens.attacks(i, q, n, state.regions));
  const dead = new Set(), kinds = new Set();
  const check = (kind, cells) => {
    if (cells.some((i) => state.cells[i] === QUEEN)) return;
    if (cells.every(blocked)) { cells.forEach((i) => dead.add(i)); kinds.add(kind); }
  };
  for (let k = 0; k < n; k++) {
    check('zona', state.regions.map((z, i) => (z === k ? i : -1)).filter((i) => i >= 0));
    check('fila', [...Array(n).keys()].map((c) => k * n + c));
    check('columna', [...Array(n).keys()].map((r) => r * n + k));
  }
  return { dead, kinds };
}

function render() {
  const { queens, bad } = findConflicts();
  const { dead } = findDeadEnds(queens);
  cellEls.forEach((el, i) => {
    el.classList.toggle('mark', state.cells[i] === MARK);
    el.classList.toggle('queen', state.cells[i] === QUEEN);
    el.classList.toggle('conflict', bad.has(i));
    el.classList.toggle('dead', dead.has(i));
    el.classList.toggle('wrong', state.wrong.has(i));
  });
  warnEl.textContent = dead.size
    ? `Sin salida en lo marcado en rojo: alguna reina está mal.`
    : '';
  btnUndo.disabled = !state.past.length;
  btnRedo.disabled = !state.future.length;
  toolsEl.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('active', state.tool === b.dataset.tool));
}

function revalidateWrong() {
  state.wrong.forEach((i) => {
    const v = state.cells[i];
    const stillWrong = (v === QUEEN && !isSolutionCell(i)) || (v === MARK && isSolutionCell(i));
    if (!stillWrong) state.wrong.delete(i);
  });
}

function afterMutation() {
  revalidateWrong();
  render();
  checkWin();
  saveGame();
}

// ---------- Entrada ----------
function cellFromPoint(x, y) {
  const el = document.elementFromPoint(x, y);
  const cell = el && el.closest ? el.closest('.q-cell') : null;
  return cell ? Number(cell.dataset.index) : null;
}

function setCell(i, value) {
  if (state.cells[i] === value) return false;
  if (!drag.recorded) { recordHistory(drag.before); drag.recorded = true; }
  state.cells[i] = value;
  return true;
}

function onPointerDown(e) {
  if (isBlocked()) return;
  const i = cellFromPoint(e.clientX, e.clientY);
  if (i === null) return;
  const v = state.cells[i];
  let value, follow = null;
  switch (state.tool) {
    case 'x':     value = v === MARK ? EMPTY : MARK; follow = value === MARK ? [EMPTY] : [MARK]; break;
    case 'queen': value = v === QUEEN ? EMPTY : QUEEN; break;
    case 'erase': value = EMPTY; follow = [MARK, QUEEN]; break;
    default:      value = (v + 1) % 3; follow = value === MARK ? [EMPTY] : null; // toque: vacía → ✕ → reina → vacía
  }
  drag = { value, from: follow, before: state.cells.slice(), recorded: false, active: !!follow };
  if (setCell(i, value)) afterMutation();
  if (drag.active) boardEl.setPointerCapture(e.pointerId);
}

function onPointerMove(e) {
  if (!drag || !drag.active) return;
  const i = cellFromPoint(e.clientX, e.clientY);
  if (i === null || !drag.from.includes(state.cells[i])) return;
  if (setCell(i, drag.value)) afterMutation();
}

function onPointerUp() { drag = null; }

function setTool(tool) {
  state.tool = state.tool === tool ? null : tool;
  render();
}

// ---------- Ayudas ----------
function checkAnswers() {
  if (isBlocked()) return;
  state.wrong.clear();
  state.cells.forEach((v, i) => {
    if ((v === QUEEN && !isSolutionCell(i)) || (v === MARK && isSolutionCell(i))) state.wrong.add(i);
  });
  render();
}

function autoMarks() {
  if (isBlocked()) return;
  const queens = state.cells.map((v, i) => (v === QUEEN ? i : -1)).filter((i) => i >= 0);
  const before = state.cells.slice();
  let changed = false;
  state.cells.forEach((v, i) => {
    if (v === EMPTY && queens.some((q) => Queens.attacks(i, q, state.n, state.regions))) { state.cells[i] = MARK; changed = true; }
  });
  if (!changed) return;
  recordHistory(before);
  afterMutation();
}

function clearMarks() {
  if (isBlocked() || !state.cells.includes(MARK)) return;
  recordHistory();
  state.cells = state.cells.map((v) => (v === MARK ? EMPTY : v));
  afterMutation();
}

function giveHint() {
  if (isBlocked()) return;
  const n = state.n;
  // primero corrige una reina mal puesta; si no hay, revela una correcta
  let i = state.cells.findIndex((v, k) => v === QUEEN && !isSolutionCell(k));
  const before = state.cells.slice();
  if (i >= 0) {
    state.cells[i] = MARK;
  } else {
    const rows = [...Array(n).keys()].filter((r) => state.cells[r * n + state.solution[r]] !== QUEEN);
    if (!rows.length) return;
    const r = rows[Math.floor(Math.random() * rows.length)];
    i = r * n + state.solution[r];
    state.cells[i] = QUEEN;
  }
  recordHistory(before);
  state.hints++;
  const el = cellEls[i];
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
  afterMutation();
}

function checkWin() {
  if (state.solved) return;
  const { queens, bad } = findConflicts();
  if (queens.length !== state.n || bad.size) return;
  state.solved = true;
  winSizeEl.textContent = `♛ ${state.n}×${state.n}` + (state.hints ? ` · 💡 ${state.hints}` : '');
  winTimeEl.textContent = `⏱ ${formatTime(state.elapsed)}`;
  winOverlay.classList.remove('hidden');
}

// ---------- Partida ----------
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

function setBoardHash() {
  try { window.history.replaceState(null, '', '#t=' + Queens.encode(state.regions)); } catch (e) { /* file:// u otro */ }
}

function loadBoard(n, regions, solution) {
  state.n = n;
  state.regions = regions;
  state.solution = solution;
  state.cells = Array(n * n).fill(EMPTY);
  state.past = [];
  state.future = [];
  state.wrong.clear();
  state.hints = 0;
  state.elapsed = 0;
  state.solved = false;
  state.paused = false;
  sizeSelect.value = String(n);
  winOverlay.classList.add('hidden');
  pauseOverlay.classList.remove('active');
  createBoardDOM();
  setBoardHash();
  render();
  startTimer();
  saveGame();
}

function startNewGame(n) {
  if (state.past.length && !state.solved) {
    if (!confirm('¿Empezar una partida nueva? Perderás el progreso actual.')) return;
  }
  btnNew.disabled = true;
  btnNew.textContent = 'Generando…';
  setTimeout(() => {
    let res = null;
    while (!res) res = Queens.generate(n);
    loadBoard(n, res.regions, res.solution);
    btnNew.disabled = false;
    btnNew.textContent = 'Nueva partida';
  }, 30);
}

function saveGame() {
  try {
    localStorage.setItem(Q_STORAGE_KEY, JSON.stringify({
      n: state.n,
      regions: state.regions,
      solution: state.solution,
      cells: state.cells,
      hints: state.hints,
      elapsed: state.elapsed,
      solved: state.solved,
    }));
  } catch (e) { /* localStorage no disponible */ }
}

function loadGame() {
  try {
    const data = JSON.parse(localStorage.getItem(Q_STORAGE_KEY) || 'null');
    if (!data || !data.n || !data.regions || data.regions.length !== data.n * data.n) return false;
    state.n = data.n;
    state.regions = data.regions;
    state.solution = data.solution;
    state.cells = data.cells;
    state.hints = data.hints || 0;
    state.elapsed = data.elapsed || 0;
    state.solved = !!data.solved;
    sizeSelect.value = String(state.n);
    createBoardDOM();
    setBoardHash();
    render();
    startTimer();
    return true;
  } catch (e) {
    return false;
  }
}

// Si el link trae un tablero (#t=...) distinto al guardado, se carga ese.
function loadFromHash() {
  const m = location.hash.match(/^#t=([a-i]+)$/);
  if (!m) return false;
  const saved = (() => { try { return JSON.parse(localStorage.getItem(Q_STORAGE_KEY) || 'null'); } catch (e) { return null; } })();
  if (saved && saved.regions && Queens.encode(saved.regions) === m[1]) return false; // es la misma partida guardada
  const board = Queens.decode(m[1]);
  if (!board) return false;
  loadBoard(board.n, board.regions, board.solution);
  return true;
}

function onKeyDown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) redo(); else undo();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (e.key === 'x' || e.key === 'X') setTool('x');
  else if (e.key === 'q' || e.key === 'Q') setTool('queen');
  else if (e.key === 'Escape') { state.tool = null; render(); }
}

function wireEvents() {
  boardEl.addEventListener('pointerdown', onPointerDown);
  boardEl.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  document.addEventListener('keydown', onKeyDown);

  toolsEl.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
  btnHint.addEventListener('click', giveHint);
  btnClearX.addEventListener('click', clearMarks);
  btnUndo.addEventListener('click', undo);
  btnRedo.addEventListener('click', redo);
  btnCheck.addEventListener('click', checkAnswers);
  btnAutoX.addEventListener('click', autoMarks);
  btnNew.addEventListener('click', () => startNewGame(Number(sizeSelect.value)));
  btnWinNew.addEventListener('click', () => startNewGame(Number(sizeSelect.value)));

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

  // Pegar el link de otro tablero con la página ya abierta solo cambia el #, sin recargar.
  window.addEventListener('hashchange', () => {
    const m = location.hash.match(/^#t=([a-i]+)$/);
    if (!m || m[1] === Queens.encode(state.regions)) return;
    if (state.past.length && !state.solved && !confirm('¿Abrir el tablero del link? Perderás el progreso actual.')) {
      setBoardHash();
      return;
    }
    const board = Queens.decode(m[1]);
    if (board) loadBoard(board.n, board.regions, board.solution);
    else setBoardHash();
  });
}

function init() {
  Theme.bind(document.getElementById('btn-theme'));
  wireEvents();
  if (!loadFromHash() && !loadGame()) startNewGame(Number(sizeSelect.value));
  if (state.solved) {
    winSizeEl.textContent = `♛ ${state.n}×${state.n}`;
    winTimeEl.textContent = `⏱ ${formatTime(state.elapsed)}`;
    winOverlay.classList.remove('hidden');
  }
}

init();
