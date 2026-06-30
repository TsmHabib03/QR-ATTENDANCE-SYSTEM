/* =========================================================================
   Single entry point for all backend calls.
   CORS-safe by construction:
     - POST with Content-Type text/plain  -> no preflight
     - no custom headers; token travels inside the JSON body
     - body is a JSON string; GAS reads e.postData.contents
   In demo mode (empty API_URL) it routes to the in-memory mock backend.

   Adds: a short TTL cache + in-flight de-dupe for read actions, a top
   progress bar around every request, and one transparent retry on a
   transient network error. Any mutating action clears the read cache.
   ========================================================================= */
(function () {
  const TTL = 15000;                 // ms a cached read stays fresh
  const cache = new Map();           // key -> { t, v }
  const inflight = new Map();        // key -> Promise (de-dupe concurrent reads)

  // Read actions safe to TTL-cache. Results are cloned on return so callers
  // can mutate freely without poisoning the cache. attendance.list/audit.list
  // are intentionally excluded (large / must stay current) — they only get
  // in-flight de-dupe.
  const CACHED = { "settings.get": 1, "analytics.summary": 1, "schedule.list": 1, "members.list": 1 };
  const READLIKE = Object.assign({ "attendance.list": 1, "audit.list": 1 }, CACHED);

  const keyOf = (action, payload) => action + ":" + JSON.stringify(payload || {});
  const clone = (v) => { try { return structuredClone(v); } catch (_) { return JSON.parse(JSON.stringify(v)); } };
  const bust = () => cache.clear();

  async function raw(action, payload) {
    if (App.isDemo) return App.mock.handle(action, payload);

    const token = App.auth ? App.auth.getToken() : "";
    let res;
    try {
      res = await fetch(App.config.API_URL, {
        method: "POST",
        redirect: "follow",                                  // GAS replies via a 302
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action, token, payload }),
      });
    } catch (e) {
      throw new Error("Network error — check your connection or API URL.");
    }

    let data;
    try { data = await res.json(); }
    catch (e) { throw new Error("Bad response from server (is the Web App URL correct and deployed for 'Anyone'?)"); }

    if (!data.ok) {
      if (/session|token|unauthor/i.test(data.error || "") && App.auth) App.auth.onExpired();
      throw new Error(data.error || "Request failed");
    }
    return data.result;
  }

  async function withRetry(action, payload) {
    try {
      return await raw(action, payload);
    } catch (e) {
      if (/Network error/.test(e.message || "")) {
        await new Promise((r) => setTimeout(r, 600));
        return raw(action, payload);                         // one transparent retry
      }
      throw e;
    }
  }

  async function call(action, payload = {}, opts = {}) {
    const key = keyOf(action, payload);
    const cacheable = CACHED[action] && !opts.fresh;
    const readlike = READLIKE[action];

    if (cacheable) {
      const hit = cache.get(key);
      if (hit && Date.now() - hit.t < TTL) return clone(hit.v);
    }
    if (readlike && inflight.has(key)) return clone(await inflight.get(key));

    if (App.ui && App.ui.progress) App.ui.progress(true);
    const p = withRetry(action, payload).finally(() => {
      if (App.ui && App.ui.progress) App.ui.progress(false);
    });

    if (readlike) {
      inflight.set(key, p);
      try {
        const v = await p;
        if (CACHED[action]) cache.set(key, { t: Date.now(), v });
        return clone(v);
      } finally { inflight.delete(key); }
    }

    const v = await p;       // mutation
    bust();                  // invalidate read cache after any write
    return v;
  }

  App.api = { call, bustCache: bust };
})();
