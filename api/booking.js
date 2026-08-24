const express = require('express');
const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: "Booking API is running!" });
});

app.get('/api/booking', (req, res) => {
  res.json({ message: "Booking API endpoint reached successfully!" });
});

module.exports = app;
