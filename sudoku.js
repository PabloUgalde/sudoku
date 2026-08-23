const Sudoku = (() => {

  const CLUES_BY_DIFFICULTY = { easy: 38, medium: 32, hard: 27, expert: 24 };

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function isValidPlacement(grid, r, c, n) {
    for (let i = 0; i < 9; i++) {
      if (grid[r * 9 + i] === n) return false;
      if (grid[i * 9 + c] === n) return false;
    }
    const br = Math.floor(r / 3) * 3;
    const bc = Math.floor(c / 3) * 3;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (grid[(br + i) * 9 + (bc + j)] === n) return false;
      }
    }
    return true;
  }

  function fillGrid(grid) {
    const idx = grid.indexOf(0);
    if (idx === -1) return true;
    const r = Math.floor(idx / 9), c = idx % 9;
    const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (const n of nums) {
      if (isValidPlacement(grid, r, c, n)) {
        grid[idx] = n;
        if (fillGrid(grid)) return true;
        grid[idx] = 0;
      }
    }
    return false;
  }

  function newSolvedGrid() {
    const grid = new Array(81).fill(0);
    fillGrid(grid);
    return grid;
  }

  function findMRVCell(grid) {
    let best = -1, bestCount = 10;
    for (let idx = 0; idx < 81; idx++) {
      if (grid[idx] !== 0) continue;
      const r = Math.floor(idx / 9), c = idx % 9;
      let count = 0;
      for (let n = 1; n <= 9; n++) {
        if (isValidPlacement(grid, r, c, n)) count++;
      }
      if (count === 0) return idx;
      if (count < bestCount) { bestCount = count; best = idx; if (count === 1) return idx; }
    }
    return best;
  }

  function countSolutions(grid, limit) {
    let count = 0;
    function backtrack() {
      if (count >= limit) return;
      const idx = findMRVCell(grid);
      if (idx === -1) { count++; return; }
      const r = Math.floor(idx / 9), c = idx % 9;
      for (let n = 1; n <= 9; n++) {
        if (count >= limit) return;
        if (isValidPlacement(grid, r, c, n)) {
          grid[idx] = n;
          backtrack();
          grid[idx] = 0;
        }
      }
    }
    backtrack();
    return count;
  }

  function generatePuzzle(difficulty) {
    const solution = newSolvedGrid();
    const puzzle = solution.slice();
    const targetClues = CLUES_BY_DIFFICULTY[difficulty] ?? CLUES_BY_DIFFICULTY.medium;
    const order = shuffle([...Array(81).keys()]);
    let cluesLeft = 81;
    for (const idx of order) {
      if (cluesLeft <= targetClues) break;
      const backup = puzzle[idx];
      puzzle[idx] = 0;
      const testGrid = puzzle.slice();
      const solutions = countSolutions(testGrid, 2);
      if (solutions === 1) {
        cluesLeft--;
      } else {
        puzzle[idx] = backup;
      }
    }
    return { givens: puzzle, solution };
  }

  function findConflicts(values) {
    const conflicts = new Set();
    for (let r = 0; r < 9; r++) {
      const seen = {};
      for (let c = 0; c < 9; c++) {
        const idx = r * 9 + c, v = values[idx];
        if (!v) continue;
        (seen[v] ||= []).push(idx);
      }
      for (const k in seen) if (seen[k].length > 1) seen[k].forEach(i => conflicts.add(i));
    }
    for (let c = 0; c < 9; c++) {
      const seen = {};
      for (let r = 0; r < 9; r++) {
        const idx = r * 9 + c, v = values[idx];
        if (!v) continue;
        (seen[v] ||= []).push(idx);
      }
      for (const k in seen) if (seen[k].length > 1) seen[k].forEach(i => conflicts.add(i));
    }
    for (let b = 0; b < 9; b++) {
      const br = Math.floor(b / 3) * 3, bc = (b % 3) * 3;
      const seen = {};
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const idx = (br + i) * 9 + (bc + j), v = values[idx];
          if (!v) continue;
          (seen[v] ||= []).push(idx);
        }
      }
      for (const k in seen) if (seen[k].length > 1) seen[k].forEach(i => conflicts.add(i));
    }
    return conflicts;
  }

  return { generatePuzzle, findConflicts, isValidPlacement, CLUES_BY_DIFFICULTY };
})();
