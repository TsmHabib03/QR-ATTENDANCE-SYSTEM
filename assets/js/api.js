/* =========================================================================
   Single entry point for all backend calls.
   CORS-safe by construction (see blueprint):
     - POST with Content-Type text/plain  -> no preflight
     - no custom headers; token travels inside the JSON body
     - body is a JSON string; GAS reads e.postData.contents
   In demo mode (empty API_URL) it routes to the in-memory mock backend.
   ========================================================================= */
(function () {
  async function call(action, payload = {}) {
    if (App.isDemo) return App.mock.handle(action, payload);

    const token = App.auth ? App.auth.getToken() : "";
    let res;
    try {
      res = await fetch(App.config.API_URL, {
        method: "POST",
        redirect: "follow", // GAS replies via a 302 to googleusercontent.com
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

  App.api = { call };
})();
