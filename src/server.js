// src/server.js
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 1. Initialize Express App
const app = express();

// 2. Middleware & Static Asset Hosting
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 3. Database Connection & Schema Setup
const dbPath = path.join(__dirname, '..', 'database.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS restaurants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      image_url TEXT,
      opening_time TEXT,
      closing_time TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurant_id INTEGER NOT NULL,
      table_number TEXT NOT NULL,
      capacity INTEGER NOT NULL DEFAULT 4,
      pos_x REAL NOT NULL DEFAULT 20,
      pos_y REAL NOT NULL DEFAULT 20,
      status TEXT NOT NULL DEFAULT 'AVAILABLE',
      FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurant_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      category TEXT DEFAULT 'Main Course',
      description TEXT DEFAULT '',
      image_url TEXT DEFAULT '',
      FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurant_id INTEGER NOT NULL,
      table_id INTEGER NOT NULL,
      customer_name TEXT NOT NULL,
      arrival_time TEXT NOT NULL,
      deposit_paid REAL NOT NULL,
      order_items_json TEXT,
      status TEXT NOT NULL DEFAULT 'CONFIRMED',
      FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
      FOREIGN KEY (table_id) REFERENCES tables(id)
    )
  `);
});

// Helper: Haversine distance formula (in km)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
            Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// 1. Nearby Restaurants API
app.get('/api/restaurants/nearby', (req, res) => {
  const userLat = parseFloat(req.query.lat) || 12.9716;
  const userLng = parseFloat(req.query.lng) || 77.5946;

  db.all("SELECT * FROM restaurants", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const results = rows.map(r => ({
      ...r,
      distanceKm: parseFloat(calculateDistance(userLat, userLng, r.lat, r.lng).toFixed(2))
    })).sort((a, b) => a.distanceKm - b.distanceKm);

    res.json(results);
  });
});

// 2. Fetch Menu Items for a Restaurant
app.get('/api/restaurants/:id/menu', (req, res) => {
  const restaurantId = req.params.id;
  db.all("SELECT * FROM menu_items WHERE restaurant_id = ?", [restaurantId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// 3. Real-time Floorplan & Table Availability API
app.get('/api/restaurants/:id/tables', (req, res) => {
  const restaurantId = req.params.id;
  const timeSlot = req.query.arrivalTime || req.query.time || "";

  // Check if tables exist for this restaurant
  db.all("SELECT * FROM tables WHERE restaurant_id = ?", [restaurantId], (err, tables) => {
    if (err) return res.status(500).json({ error: err.message });

    // Seed default floor plan if no tables exist in database for this restaurant
    if (!tables || tables.length === 0) {
      const defaultTables = [
        ["T1", 2, 25, 30],
        ["T2", 4, 60, 30],
        ["T3", 4, 25, 70],
        ["T4", 6, 60, 70],
      ];

      const stmt = db.prepare(
        "INSERT INTO tables (restaurant_id, table_number, capacity, pos_x, pos_y, status) VALUES (?, ?, ?, ?, ?, 'AVAILABLE')"
      );
      defaultTables.forEach(([num, cap, x, y]) => stmt.run(restaurantId, num, cap, x, y));
      stmt.finalize(() => {
        fetchTablesWithAvailability(restaurantId, timeSlot, res);
      });
      return;
    }

    fetchTablesWithAvailability(restaurantId, timeSlot, res);
  });
});

function fetchTablesWithAvailability(restaurantId, timeSlot, res) {
  if (!timeSlot) {
    db.all("SELECT *, 'AVAILABLE' as status FROM tables WHERE restaurant_id = ?", [restaurantId], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      return res.json(rows);
    });
    return;
  }

  const query = `
    SELECT t.*, 
      CASE WHEN r.id IS NOT NULL THEN 'BOOKED' ELSE 'AVAILABLE' END as status
    FROM tables t
    LEFT JOIN reservations r 
      ON t.id = r.table_id 
      AND r.arrival_time = ? 
      AND r.status = 'CONFIRMED'
    WHERE t.restaurant_id = ?
  `;

  db.all(query, [timeSlot, restaurantId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
}

// 4. Pre-order Deposit & Booking Checkout API
app.post('/api/checkout', (req, res) => {
  const { restaurantId, tableId, customerName, arrivalTime, cartItems } = req.body;

  if (!restaurantId || !tableId || !customerName || !arrivalTime || !cartItems || cartItems.length === 0) {
    return res.status(400).json({ error: "Missing required booking details or empty cart" });
  }

  // Double-booking check
  db.get(
    `SELECT id FROM reservations WHERE table_id = ? AND arrival_time = ? AND status = 'CONFIRMED'`,
    [tableId, arrivalTime],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (row) {
        return res.status(409).json({ error: "Table is already booked for this time slot." });
      }

      // Calculate food subtotal and 20% deposit
      const totalAmount = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const depositAmount = parseFloat((totalAmount * 0.20).toFixed(2));

      const stmt = db.prepare(`
        INSERT INTO reservations (restaurant_id, table_id, customer_name, arrival_time, deposit_paid, order_items_json, status)
        VALUES (?, ?, ?, ?, ?, ?, 'CONFIRMED')
      `);

      stmt.run(
        [restaurantId, tableId, customerName, arrivalTime, depositAmount, JSON.stringify(cartItems)],
        function (err) {
          if (err) return res.status(500).json({ error: err.message });

          res.json({
            success: true,
            bookingId: this.lastID,
            totalAmount: parseFloat(totalAmount.toFixed(2)),
            depositPaid: depositAmount,
            message: "Reservation confirmed and deposit processed successfully."
          });
        }
      );
    }
  );
});

// 5. Onboard New Restaurant Handler
function handleRegister(req, res) {
  const { name, address, lat, lng, imageUrl, openingTime, closingTime, menuItems } = req.body;

  if (!name || !address || lat === undefined || lng === undefined) {
    return res.status(400).json({ error: "Missing required fields: name, address, lat, lng" });
  }

  const image = imageUrl || "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=500";
  const open = openingTime || "09:00";
  const close = closingTime || "22:00";

  const sql = `INSERT INTO restaurants (name, lat, lng, address, image_url, opening_time, closing_time) VALUES (?, ?, ?, ?, ?, ?, ?)`;

  db.run(sql, [name, parseFloat(lat), parseFloat(lng), address, image, open, close], function (err) {
    if (err) return res.status(500).json({ error: err.message });

    const restaurantId = this.lastID;

    // Seed initial tables for new restaurant
    const defaultTables = [
      ["T1", 2, 25, 30],
      ["T2", 4, 60, 30],
      ["T3", 4, 25, 70],
      ["T4", 6, 60, 70],
    ];
    const tableStmt = db.prepare(
      "INSERT INTO tables (restaurant_id, table_number, capacity, pos_x, pos_y, status) VALUES (?, ?, ?, ?, ?, 'AVAILABLE')"
    );
    defaultTables.forEach(([num, cap, x, y]) => tableStmt.run(restaurantId, num, cap, x, y));
    tableStmt.finalize();

    // Insert dynamic menu items
    if (Array.isArray(menuItems) && menuItems.length > 0) {
      const menuStmt = db.prepare(
        `INSERT INTO menu_items (restaurant_id, name, price, category, description, image_url) VALUES (?, ?, ?, ?, ?, ?)`
      );
      menuItems.forEach(item => {
        menuStmt.run([
          restaurantId,
          item.name,
          parseFloat(item.price),
          item.category || 'Main Course',
          item.description || '',
          item.imageUrl || ''
        ]);
      });
      menuStmt.finalize();
    }

    res.json({
      success: true,
      restaurantId: restaurantId,
      message: `Restaurant '${name}' onboarded successfully!`
    });
  });
}

// Support both endpoint paths
app.post('/api/restaurants/register', handleRegister);
app.post('/api/partners/register', handleRegister);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend API running on http://localhost:${PORT}`));
