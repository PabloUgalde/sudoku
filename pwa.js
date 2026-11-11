// Registro del service worker, compartido por todas las páginas.
// - updateViaCache 'none': al buscar actualizaciones nunca usa una copia vieja de sw.js.
// - Si una versión nueva toma el control con la página abierta, recarga una sola vez
//   para mostrarla (la partida no se pierde: Sudoku y Queens la guardan en el teléfono).
(function () {
  if (!('serviceWorker' in navigator)) return;

  const habiaVersionAnterior = !!navigator.serviceWorker.controller;
  let recargado = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!habiaVersionAnterior || recargado) return; // primera instalación: no hace falta recargar
    recargado = true;
    location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        // Al volver a la app desde segundo plano, revisar si hay una versión nueva.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {});
        });
      })
      .catch(() => {});
  });
})();
