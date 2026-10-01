/* ==========================================================================
   api.js  -  every call to the backend lives here.
   ========================================================================== */
class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function request(path, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(CONFIG.API_BASE + path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (_) {
    throw new ApiError("Cannot reach the server. Check that the backend is running at " + CONFIG.API_BASE + ".", 0);
  }
  let data = null;
  try { data = await res.json(); } catch (_) { /* empty or non-JSON body */ }
  if (!res.ok) {
    throw new ApiError((data && (data.error || data.message)) || "Request failed (" + res.status + ").", res.status);
  }
  return data;
}

const Api = {
  // GET /api/restaurants/nearby?lat=&lng=
  nearby: (lat, lng) => request(`/api/restaurants/nearby?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`),
  // GET /api/restaurants/:id/menu
  menu: (id) => request(`/api/restaurants/${encodeURIComponent(id)}/menu`),
  // GET /api/restaurants/:id/tables?time=YYYY-MM-DD HH:MM
  tables: (id, time) => request(`/api/restaurants/${encodeURIComponent(id)}/tables?time=${encodeURIComponent(time)}`),
  // POST /api/checkout
  checkout: (payload) => request("/api/checkout", { method: "POST", body: payload }),
  // POST /api/restaurants/register
  register: (payload) => request("/api/restaurants/register", { method: "POST", body: payload }),
};
