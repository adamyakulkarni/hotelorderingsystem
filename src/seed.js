// src/seed.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Connect to SQLite database file
const dbPath = path.join(__dirname, '..', 'database.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    console.log("Initializing database schema...");

    // 1. Create Tables
 // In src/seed.js inside db.serialize()
db.run(`
  CREATE TABLE IF NOT EXISTS restaurants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    address TEXT NOT NULL,
    image_url TEXT,
    opening_time TEXT DEFAULT '09:00',
    closing_time TEXT DEFAULT '22:00'
  )
`);

    db.run(`CREATE TABLE IF NOT EXISTS tables (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        restaurant_id INTEGER NOT NULL,
        table_number INTEGER NOT NULL,
        capacity INTEGER NOT NULL,
        pos_x INTEGER NOT NULL,
        pos_y INTEGER NOT NULL,
        FOREIGN KEY(restaurant_id) REFERENCES restaurants(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS menu_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        restaurant_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        category TEXT DEFAULT 'Main Course',
        FOREIGN KEY(restaurant_id) REFERENCES restaurants(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS reservations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        restaurant_id INTEGER NOT NULL,
        table_id INTEGER NOT NULL,
        customer_name TEXT NOT NULL,
        arrival_time TEXT NOT NULL,
        deposit_paid REAL NOT NULL,
        order_items_json TEXT NOT NULL,
        status TEXT DEFAULT 'CONFIRMED'
    )`);

    // 2. Clear Existing Data
    db.run(`DELETE FROM restaurants`);
    db.run(`DELETE FROM tables`);
    db.run(`DELETE FROM menu_items`);
    db.run(`DELETE FROM reservations`);

    console.log("Seeding fresh restaurant data...");

    // 3. Insert Restaurants
    const stmtRest = db.prepare(`INSERT INTO restaurants (name, lat, lng, address, image_url) VALUES (?, ?, ?, ?, ?)`);
    
    // Restaurant 1 (Bengaluru Center)
    stmtRest.run("Bistro Central", 12.9716, 77.5946, "123 MG Road, Central District", "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=500");
    // Restaurant 2 (Koramangala)
    stmtRest.run("Urban Diner & Grill", 12.9352, 77.6245, "456 80ft Road, Koramangala", "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=500");
    // Restaurant 3 (Indiranagar)
    stmtRest.run("Taco & Tap House", 12.9784, 77.6408, "789 100ft Road, Indiranagar", "https://images.unsplash.com/photo-1552566626-52f8b828add9?w=500");
    stmtRest.finalize();

    // 4. Insert Floorplan Tables
    const stmtTables = db.prepare(`INSERT INTO tables (restaurant_id, table_number, capacity, pos_x, pos_y) VALUES (?, ?, ?, ?, ?)`);
    
    // Tables for Bistro Central (ID: 1)
    stmtTables.run(1, 1, 2, 10, 20); // Table 1 (2 seater)
    stmtTables.run(1, 2, 2, 10, 60); // Table 2 (2 seater)
    stmtTables.run(1, 3, 4, 45, 20); // Table 3 (4 seater)
    stmtTables.run(1, 4, 4, 45, 60); // Table 4 (4 seater)
    stmtTables.run(1, 5, 6, 75, 40); // Table 5 (6 seater VIP)

    // Tables for Urban Diner (ID: 2)
    stmtTables.run(2, 1, 2, 15, 30);
    stmtTables.run(2, 2, 4, 50, 30);
    stmtTables.run(2, 3, 8, 70, 60);

    // Tables for Taco & Tap House (ID: 3)
    stmtTables.run(3, 1, 2, 20, 20);
    stmtTables.run(3, 2, 4, 50, 50);
    stmtTables.run(3, 3, 4, 80, 20);
    stmtTables.finalize();

    // 5. Insert Menu Items
    const stmtMenu = db.prepare(`INSERT INTO menu_items (restaurant_id, name, price, category) VALUES (?, ?, ?, ?)`);
    
    // Menu for Bistro Central (ID: 1)
    stmtMenu.run(1, "Margherita Pizza", 12.99, "Main Course");
    stmtMenu.run(1, "Creamy Carbonara", 14.50, "Main Course");
    stmtMenu.run(1, "Truffle Fries", 6.99, "Appetizers");
    stmtMenu.run(1, "Caesar Salad", 8.50, "Appetizers");
    stmtMenu.run(1, "Iced Peach Tea", 3.50, "Beverages");
    stmtMenu.run(1, "Tiramisu", 5.99, "Desserts");

    // Menu for Urban Diner (ID: 2)
    stmtMenu.run(2, "Smokey BBQ Cheeseburger", 11.99, "Main Course");
    stmtMenu.run(2, "Grilled Ribeye Steak", 22.50, "Main Course");
    stmtMenu.run(2, "Buffalo Wings (8pcs)", 8.99, "Appetizers");
    stmtMenu.run(2, "Craft Lemonade", 3.99, "Beverages");

    // Menu for Taco & Tap House (ID: 3)
    stmtMenu.run(3, "Baja Fish Tacos (3pcs)", 10.50, "Main Course");
    stmtMenu.run(3, "Loaded Nachos Supreme", 9.00, "Appetizers");
    stmtMenu.run(3, "Churros with Chocolate", 4.99, "Desserts");
    stmtMenu.run(3, "Sparkling Water", 2.50, "Beverages");
    stmtMenu.finalize();

    console.log("Database seeded successfully with 3 restaurants, floorplans, and menus!");
});

db.close();
