// Motor de Queens: una reina por fila, columna y zona de color, sin tocarse (ni en diagonal).
// Las zonas se numeran 0..n-1 según la fila de la reina de la solución (zona k = la de la fila k).
const Queens = (() => {

  const rnd = (n) => Math.floor(Math.random() * n);
  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };

  function neighbors4(i, n) {
    const r = Math.floor(i / n), c = i % n, out = [];
    if (r > 0) out.push(i - n);
    if (r < n - 1) out.push(i + n);
    if (c > 0) out.push(i - 1);
    if (c < n - 1) out.push(i + 1);
    return out;
  }

  // ¿Se atacan dos celdas? (misma fila, columna, zona o pegadas)
  function attacks(i, j, n, reg) {
    if (i === j) return false;
    const ri = Math.floor(i / n), ci = i % n, rj = Math.floor(j / n), cj = j % n;
    return ri === rj || ci === cj || reg[i] === reg[j] || (Math.abs(ri - rj) <= 1 && Math.abs(ci - cj) <= 1);
  }

  // 1) posición aleatoria válida de reinas (una por fila/columna, sin tocarse)
  function randomPlacement(n) {
    const p = [], used = Array(n).fill(false);
    (function bt(r) {
      if (r === n) return true;
      for (const c of shuffle([...Array(n).keys()])) {
        if (used[c] || (r > 0 && Math.abs(c - p[r - 1]) <= 1)) continue;
        used[c] = true; p[r] = c;
        if (bt(r + 1)) return true;
        used[c] = false;
      }
      return false;
    })(0);
    return p;
  }

  // 2) cada reina es la semilla de una zona; las zonas crecen al azar hasta cubrir el tablero
  function growRegions(p, n) {
    const g = Array(n * n).fill(-1);
    p.forEach((c, r) => { g[r * n + c] = r; });
    let left = n * n - n;
    while (left > 0) {
      const i = rnd(n * n);
      if (g[i] !== -1) continue;
      const adj = neighbors4(i, n).filter((j) => g[j] !== -1);
      if (!adj.length) continue;
      g[i] = g[adj[rnd(adj.length)]];
      left--;
    }
    return g;
  }

  // Recorre las soluciones; se detiene al llegar a `cap`. Devuelve { count, first }.
  function solve(g, n, cap) {
    let count = 0, first = null;
    const p = [], colU = Array(n).fill(false), regU = Array(n).fill(false);
    (function bt(r, prev) {
      if (r === n) { count++; if (!first) first = p.slice(); return count >= cap; }
      for (let c = 0; c < n; c++) {
        if (colU[c] || Math.abs(c - prev) <= 1) continue;
        const z = g[r * n + c];
        if (regU[z]) continue;
        colU[c] = regU[z] = true; p[r] = c;
        const stop = bt(r + 1, c);
        colU[c] = regU[z] = false;
        if (stop) return true;
      }
      return false;
    })(0, -10);
    return { count, first };
  }

  function stillConnected(g, n, zone, removed, seed) {
    let size = 0;
    for (let i = 0; i < g.length; i++) if (g[i] === zone && i !== removed) size++;
    const seen = new Set([seed]), q = [seed];
    while (q.length) {
      const i = q.pop();
      for (const j of neighbors4(i, n)) {
        if (j !== removed && g[j] === zone && !seen.has(j)) { seen.add(j); q.push(j); }
      }
    }
    return seen.size === size;
  }

  // 3) pasa una celda de borde a la zona vecina, sin mover las celdas de la solución
  function mutate(g, p, n) {
    const i = rnd(n * n), r = Math.floor(i / n), zone = g[i];
    if (p[r] === i % n) return null;
    const other = neighbors4(i, n).map((j) => g[j]).filter((z) => z !== zone);
    if (!other.length) return null;
    if (!stillConnected(g, n, zone, i, zone * n + p[zone])) return null;
    const g2 = g.slice();
    g2[i] = other[rnd(other.length)];
    return g2;
  }

  // Ajusta las zonas hasta que la solución sea única.
  function generate(n) {
    for (let attempt = 0; attempt < 60; attempt++) {
      const p = randomPlacement(n);
      let g = growRegions(p, n);
      let cnt = solve(g, n, 200).count;
      for (let it = 0; cnt > 1 && it < 4000; it++) {
        const g2 = mutate(g, p, n);
        if (!g2) continue;
        const c2 = solve(g2, n, 200).count;
        if (c2 <= cnt) { g = g2; cnt = c2; }
      }
      if (cnt === 1) return { regions: g, solution: p };
    }
    return null;
  }

  // Código de tablero para compartir/recargar: una letra por celda (a = zona 0, b = zona 1, ...).
  function encode(regions) {
    return regions.map((z) => String.fromCharCode(97 + z)).join('');
  }

  // Devuelve { n, regions, solution } o null si el código no es un tablero válido de solución única.
  function decode(code) {
    if (!/^[a-i]+$/.test(code || '')) return null;
    const n = Math.round(Math.sqrt(code.length));
    if (n < 5 || n > 9 || n * n !== code.length) return null;
    const regions = code.split('').map((ch) => ch.charCodeAt(0) - 97);
    if (new Set(regions).size !== n || regions.some((z) => z >= n)) return null;
    const { count, first } = solve(regions, n, 2);
    if (count !== 1) return null;
    return { n, regions, solution: first };
  }

  return { generate, encode, decode, attacks };
})();
