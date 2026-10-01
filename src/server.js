// src/server.js
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const db = new sqlite3.Database('./database.db');

const multer = require('multer');
const path = require('path');

// Configure local file storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'src/public/uploads/'),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// API Route: Register Restaurant with Photo Upload
app.post('/api/restaurants/register', upload.single('image'), (req, res) => {
    const { name, email, password, address, lat, lng } = req.body;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : '/uploads/default.jpg';

    const sql = `INSERT INTO restaurants (name, email, password_hash, address, lat, lng, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    db.run(sql, [name, email, password, address, lat, lng, imageUrl], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, restaurantId: this.lastID, imageUrl });
    });
});

// API Route: Add Menu Item with Photo
app.post('/api/menu/add', upload.single('itemImage'), (req, res) => {
    const { restaurantId, name, price, category } = req.body;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const sql = `INSERT INTO menu_items (restaurant_id, name, price, category, image_url) VALUES (?, ?, ?, ?, ?)`;
    db.run(sql, [restaurantId, name, price, category, imageUrl], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, itemId: this.lastID });
    });
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));


// Calculate geographic distance in kilometers
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
              Math.sin(dLon / 2) ** 2;
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// Endpoint 1: Fetch Nearby Restaurants
app.get('/api/restaurants/nearby', (req, res) => {
    const userLat = parseFloat(req.query.lat) || 12.9716;
    const userLng = parseFloat(req.query.lng) || 77.5946;

    db.all("SELECT * FROM restaurants", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        const results = rows.map(r => ({
            ...r,
            distanceKm: calculateDistance(userLat, userLng, r.lat, r.lng).toFixed(2)
        })).sort((a, b) => a.distanceKm - b.distanceKm);

        res.json(results);
    });
});


// Endpoint 2: Get Tables with Real-time Slot Availability
app.get('/api/restaurants/:id/tables', (req, res) => {
    const restaurantId = req.params.id;
    const timeSlot = req.query.time; // Format: "YYYY-MM-DD HH:MM"

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
});

// Endpoint 3: Pre-order Checkout & Deposit Payment
app.post('/api/checkout', (req, res) => {
    const { restaurantId, tableId, customerName, arrivalTime, cartItems } = req.body;

    if (!cartItems || cartItems.length === 0) {
        return res.status(400).json({ error: "Cart cannot be empty" });
    }

    // Calculate total and 20% deposit
    const totalAmount = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const depositAmount = parseFloat((totalAmount * 0.20).toFixed(2));

    // Double-check table conflict
    db.get(
        `SELECT id FROM reservations WHERE table_id = ? AND arrival_time = ? AND status = 'CONFIRMED'`,
        [tableId, arrivalTime],
        (err, row) => {
            if (row) {
                return res.status(409).json({ error: "Table is already booked for this time slot." });
            }

            // Insert confirmed reservation
            const stmt = db.prepare(`
                INSERT INTO reservations (restaurant_id, table_id, customer_name, arrival_time, deposit_paid, order_items_json)
                VALUES (?, ?, ?, ?, ?, ?)
            `);

            stmt.run(
                [restaurantId, tableId, customerName, arrivalTime, depositAmount, JSON.stringify(cartItems)],
                function (err) {
                    if (err) return res.status(500).json({ error: err.message });

                    res.json({
                        success: true,
                        bookingId: this.lastID,
                        totalAmount,
                        depositPaid: depositAmount,
                        message: "Reservation confirmed and deposit processed."
                    });
                }
            );
        }
    );
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

