# Restaurant Pre-Ordering & Floorplan Reservation System

A full-stack demo application allowing users to find nearby restaurants, select arrival times, pick specific tables using a visual floorplan, pre-order food, and pay a deposit.

## Features
* **Geospatial Proximity Calculation**: Uses the Haversine formula to compute and rank distance.
* **Visual Table Selection**: Render floorplans directly from database X/Y coordinates.
* **Time-Slot Availability Locking**: Prevents double bookings for matching time windows.
* **Pre-order Deposit Gateway**: Calculates and records a 20% deposit upfront.

## How to Run

1. **Clone repository**:
   ```bash
   git clone [https://github.com/YOUR_USERNAME/restaurant-preorder-demo.git](https://github.com/YOUR_USERNAME/restaurant-preorder-demo.git)
   cd restaurant-preorder-demo
