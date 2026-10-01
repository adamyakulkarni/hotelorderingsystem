/* ==========================================================================
   config.js  -  the only settings you should need to change.
   ========================================================================== */
const CONFIG = {
  APP_NAME: "Tablemate",
  API_BASE: "http://localhost:3000",                // your Node/Express backend
  DEFAULT_LOCATION: { lat: 12.9716, lng: 77.5946 }, // used until the visitor shares their location
  CURRENCY: "$",                                    // your sample prices look like dollars; change to "\u20B9" for rupees
  DEPOSIT_RATE: 0.20,                               // display only; the backend calculates the real deposit

  // Arrival time slots offered on the floor plan step
  SLOT_START: "11:00",
  SLOT_END: "22:30",
  SLOT_MINUTES: 30,

  // Menu categories are shown in this order; any others follow after
  CATEGORY_ORDER: ["Appetizers", "Main Course", "Desserts", "Beverages"],
};
