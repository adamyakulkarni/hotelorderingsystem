/* ==========================================================================
   api.js - Centralized Frontend API Service
   ========================================================================== */

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
  Generic HTTP request wrapper
 */
async function request(path, { method = "GET", body } = {}) {
  let res;
  const baseUrl = typeof CONFIG !== "undefined" && CONFIG.API_BASE ? CONFIG.API_BASE : "";

  try {
    res = await fetch(baseUrl + path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (_) {
    throw new ApiError(
      "Cannot reach the server. Check that the backend is running.",
      0
    );
  }

  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    /* Empty or non-JSON response body */
  }

  if (!res.ok) {
    const errorMsg =
      (data && (data.error || data.message)) ||
      `Request failed with status ${res.status}.`;
    throw new ApiError(errorMsg, res.status);
  }

  return data;
}

/**
  Global API Object
 */
const Api = {
  // GET /api/restaurants/nearby?lat=...&lng=...
  nearby: (lat, lng) =>
    request(`/api/restaurants/nearby?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`),

  // GET /api/restaurants/:id/menu
  menu: (restaurantId) =>
    request(`/api/restaurants/${encodeURIComponent(restaurantId)}/menu`),

  // GET /api/restaurants/:id/tables?arrivalTime=...
  tables: (restaurantId, arrivalTime) =>
    request(
      `/api/restaurants/${encodeURIComponent(restaurantId)}/tables?arrivalTime=${encodeURIComponent(arrivalTime || "")}`
    ),

  // POST /api/checkout
  checkout: (payload) =>
    request("/api/checkout", {
      method: "POST",
      body: payload,
    }),

  // POST /api/partners/register
  registerRestaurant: (payload) =>
    request("/api/partners/register", {
      method: "POST",
      body: payload,
    }),
};

// Expose Api globally on window
window.Api = Api;
window.ApiError = ApiError;
