// src/server.js
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

const app = express();
const dbPath = path.join(__dirname, '..', 'database.db');
const db = new sqlite3.Database(dbPath);

app.use(express.json());

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
    const timeSlot = req.query.time; // Format: "YYYY-MM-DD HH:MM"

    if (!timeSlot) {
        return res.status(400).json({ error: "Query parameter 'time' is required (e.g., ?time=2026-10-01 19:00)" });
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
});

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
            if (row) {
                return res.status(409).json({ error: "Table is already booked for this time slot." });
            }

            // Calculate food subtotal and 20% deposit
            const totalAmount = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            const depositAmount = parseFloat((totalAmount * 0.20).toFixed(2));

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
                        totalAmount: parseFloat(totalAmount.toFixed(2)),
                        depositPaid: depositAmount,
                        message: "Reservation confirmed and deposit processed successfully."
                    });
                }
            );
        }
    );
});

// 5. Onboard New Restaurant API
app.post('/api/restaurants/register', (req, res) => {
    const { name, address, lat, lng } = req.body;

    if (!name || !address || !lat || !lng) {
        return res.status(400).json({ error: "Missing fields: name, address, lat, lng are required" });
    }

    const defaultImage = "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=500";
    const sql = `INSERT INTO restaurants (name, lat, lng, address, image_url) VALUES (?, ?, ?, ?, ?)`;

    db.run(sql, [name, parseFloat(lat), parseFloat(lng), address, defaultImage], function (err) {
        if (err) return res.status(500).json({ error: err.message });

        const newId = this.lastID;
        res.json({
            success: true,
            restaurantId: newId,
            message: `Restaurant '${name}' onboarded successfully!`
        });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend API running on http://localhost:${PORT}`));
