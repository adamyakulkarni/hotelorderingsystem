// src/seed.js
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.db');

db.serialize(() => {
    // 1. Create Tables
    db.run(`CREATE TABLE IF NOT EXISTS restaurants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        lat REAL,
        lng REAL,
        address TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS tables (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        restaurant_id INTEGER,
        table_number INTEGER,
        capacity INTEGER,
        pos_x INTEGER,
        pos_y INTEGER
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS menu_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        restaurant_id INTEGER,
        name TEXT,
        price REAL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS reservations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        restaurant_id INTEGER,
        table_id INTEGER,
        customer_name TEXT,
        arrival_time TEXT,
        deposit_paid REAL,
        order_items_json TEXT,
        status TEXT DEFAULT 'CONFIRMED'
    )`);

    // 2. Insert Seed Data
    db.run(`DELETE FROM restaurants`);
    db.run(`DELETE FROM tables`);
    db.run(`DELETE FROM menu_items`);

    const stmtRest = db.prepare(`INSERT INTO restaurants (name, lat, lng, address) VALUES (?, ?, ?, ?)`);
    stmtRest.run("Bistro Central", 12.9716, 77.5946, "123 Main St");
    stmtRest.run("Urban Diner", 12.9352, 77.6245, "456 Park Ave");
    stmtRest.finalize();

    // Tables for Bistro Central (id: 1)
    const stmtTables = db.prepare(`INSERT INTO tables (restaurant_id, table_number, capacity, pos_x, pos_y) VALUES (?, ?, ?, ?, ?)`);
    stmtTables.run(1, 1, 2, 10, 20); // Table 1 at X:10%, Y:20%
    stmtTables.run(1, 2, 4, 40, 20); // Table 2 at X:40%, Y:20%
    stmtTables.run(1, 3, 6, 70, 50); // Table 3 at X:70%, Y:50%
    stmtTables.finalize();

    // Menu for Bistro Central (id: 1)
    const stmtMenu = db.prepare(`INSERT INTO menu_items (restaurant_id, name, price) VALUES (?, ?, ?)`);
    stmtMenu.run(1, "Margherita Pizza", 12.99);
    stmtMenu.run(1, "Pasta Carbonara", 14.50);
    stmtMenu.run(1, "Iced Tea", 3.50);
    stmtMenu.finalize();

    console.log("Database initialized and seeded successfully.");
});

db.close();
