/* =========================================================================
   bus.js — tiny pub/sub so pages can react to app-wide events without
   tight coupling. e.g. the scanner emits "attendance:changed" and the
   dashboard/analytics refresh their KPIs instantly.
   ========================================================================= */
(function () {
  const map = {};
  App.bus = {
    on(evt, fn) {
      (map[evt] || (map[evt] = [])).push(fn);
      return () => App.bus.off(evt, fn);           // returns an unsubscribe fn
    },
    off(evt, fn) {
      map[evt] = (map[evt] || []).filter((f) => f !== fn);
    },
    emit(evt, data) {
      (map[evt] || []).forEach((f) => { try { f(data); } catch (_) {} });
    },
  };
})();
