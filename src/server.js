const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../src/public')));

// Create MySQL Connection Pool
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  port: process.env.MYSQL_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: process.env.MYSQL_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// Auto-Initialize MySQL Database Schema
async function initDB() {
  try {
    const connection = await pool.getConnection();

    await connection.query(`
      CREATE TABLE IF NOT EXISTS restaurants (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        address TEXT NOT NULL,
        lat DOUBLE NOT NULL,
        lng DOUBLE NOT NULL,
        image_url TEXT,
        opening_time VARCHAR(10) DEFAULT '09:00',
        closing_time VARCHAR(10) DEFAULT '22:00'
      ) ENGINE=InnoDB;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS tables (
        id INT AUTO_INCREMENT PRIMARY KEY,
        restaurant_id INT NOT NULL,
        table_number VARCHAR(50) NOT NULL,
        capacity INT NOT NULL DEFAULT 4,
        pos_x DOUBLE NOT NULL DEFAULT 20,
        pos_y DOUBLE NOT NULL DEFAULT 20,
        status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',
        FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS menu_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        restaurant_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        price DOUBLE NOT NULL,
        category VARCHAR(100) DEFAULT 'Main Course',
        description TEXT,
        image_url TEXT,
        FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS reservations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        restaurant_id INT NOT NULL,
        table_id INT NOT NULL,
        customer_name VARCHAR(255) NOT NULL,
        arrival_time VARCHAR(100) NOT NULL,
        deposit_paid DOUBLE NOT NULL,
        order_items_json JSON,
        status VARCHAR(20) NOT NULL DEFAULT 'CONFIRMED',
        FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
        FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    connection.release();
    console.log("MySQL Database Connected & Schema Verified.");
  } catch (err) {
    console.error("MySQL Setup Error:", err.message);
  }
}

initDB();

// Distance calculation formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
            Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// 1. Get Nearby Restaurants
app.get('/api/restaurants/nearby', async (req, res) => {
  try {
    const userLat = parseFloat(req.query.lat) || 12.9716;
    const userLng = parseFloat(req.query.lng) || 77.5946;

    const [rows] = await pool.query("SELECT * FROM restaurants");
    const results = rows.map(r => ({
      ...r,
      distanceKm: parseFloat(calculateDistance(userLat, userLng, r.lat, r.lng).toFixed(2))
    })).sort((a, b) => a.distanceKm - b.distanceKm);

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Get Menu
app.get('/api/restaurants/:id/menu', async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM menu_items WHERE restaurant_id = ?", [req.params.id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Get Tables & Slot Availability
app.get('/api/restaurants/:id/tables', async (req, res) => {
  try {
    const restaurantId = req.params.id;
    const timeSlot = req.query.arrivalTime || req.query.time || "";

    const [tables] = await pool.query("SELECT * FROM tables WHERE restaurant_id = ?", [restaurantId]);

    // Seed default tables if venue has none
    if (!tables || tables.length === 0) {
      const defaultTables = [
        [restaurantId, "T1", 2, 25, 30, 'AVAILABLE'],
        [restaurantId, "T2", 4, 75, 30, 'AVAILABLE'],
        [restaurantId, "T3", 4, 25, 70, 'AVAILABLE'],
        [restaurantId, "T4", 6, 75, 70, 'AVAILABLE'],
      ];
      await pool.query(
        "INSERT INTO tables (restaurant_id, table_number, capacity, pos_x, pos_y, status) VALUES ?",
        [defaultTables]
      );
    }

    if (!timeSlot) {
      const [allTables] = await pool.query("SELECT *, 'AVAILABLE' as status FROM tables WHERE restaurant_id = ?", [restaurantId]);
      return res.json(allTables);
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

    const [availabilityRows] = await pool.query(query, [timeSlot, restaurantId]);
    res.json(availabilityRows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Checkout Endpoint
app.post('/api/checkout', async (req, res) => {
  try {
    const { restaurantId, tableId, customerName, arrivalTime, cartItems } = req.body;
    if (!restaurantId || !tableId || !customerName || !arrivalTime || !cartItems || cartItems.length === 0) {
      return res.status(400).json({ error: "Missing required booking details or empty cart" });
    }

    const [existing] = await pool.query(
      `SELECT id FROM reservations WHERE table_id = ? AND arrival_time = ? AND status = 'CONFIRMED'`,
      [tableId, arrivalTime]
    );

    if (existing.length > 0) {
      return res.status(409).json({ error: "Table is already booked for this time slot." });
    }

    const totalAmount = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const depositAmount = parseFloat((totalAmount * 0.20).toFixed(2));

    const [result] = await pool.query(
      `INSERT INTO reservations (restaurant_id, table_id, customer_name, arrival_time, deposit_paid, order_items_json, status)
       VALUES (?, ?, ?, ?, ?, ?, 'CONFIRMED')`,
      [restaurantId, tableId, customerName, arrivalTime, depositAmount, JSON.stringify(cartItems)]
    );

    res.json({
      success: true,
      bookingId: result.insertId,
      totalAmount: parseFloat(totalAmount.toFixed(2)),
      depositPaid: depositAmount,
      message: "Reservation confirmed successfully."
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Register Endpoint
const handleRegister = async (req, res) => {
  try {
    const { name, address, lat, lng, imageUrl, openingTime, closingTime, menuItems } = req.body;
    if (!name || !address || lat === undefined || lng === undefined) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const image = imageUrl || "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=500";
    const open = openingTime || "09:00";
    const close = closingTime || "22:00";

    const [restResult] = await pool.query(
      `INSERT INTO restaurants (name, lat, lng, address, image_url, opening_time, closing_time) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, parseFloat(lat), parseFloat(lng), address, image, open, close]
    );

    const restaurantId = restResult.insertId;

    const defaultTables = [
      [restaurantId, "T1", 2, 25, 30, 'AVAILABLE'],
      [restaurantId, "T2", 4, 75, 30, 'AVAILABLE'],
      [restaurantId, "T3", 4, 25, 70, 'AVAILABLE'],
      [restaurantId, "T4", 6, 75, 70, 'AVAILABLE'],
    ];
    await pool.query(
      "INSERT INTO tables (restaurant_id, table_number, capacity, pos_x, pos_y, status) VALUES ?",
      [defaultTables]
    );

    if (Array.isArray(menuItems) && menuItems.length > 0) {
      const menuRows = menuItems.map(item => [
        restaurantId,
        item.name,
        parseFloat(item.price),
        item.category || 'Main Course',
        item.description || '',
        item.imageUrl || ''
      ]);
      await pool.query(
        `INSERT INTO menu_items (restaurant_id, name, price, category, description, image_url) VALUES ?`,
        [menuRows]
      );
    }

    res.json({ success: true, restaurantId, message: `Restaurant '${name}' onboarded successfully!` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

app.post('/api/restaurants/register', handleRegister);
app.post('/api/partners/register', handleRegister);

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../src/public/index.html'));
});


