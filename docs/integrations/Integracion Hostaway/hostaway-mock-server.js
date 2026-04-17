const express = require('express');
const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mock token (válido por 24 meses según Hostaway)
const MOCK_TOKEN = 'mock_token_12345_valid_24_months';

// ============================================
// POST /v1/accessTokens - Generar token OAuth2
// ============================================
app.post('/v1/accessTokens', (req, res) => {
  const { grant_type, client_id, client_secret, scope } = req.body;
  
  // Validación básica
  if (grant_type !== 'client_credentials' || !client_id || !client_secret) {
    return res.status(400).json({ error: 'invalid_request' });
  }

  res.json({
    token_type: 'Bearer',
    expires_in: 63072000, // 24 meses
    access_token: MOCK_TOKEN
  });
});

// ============================================
// GET /v1/reservations - Traer reservaciones
// ============================================
app.get('/v1/reservations', (req, res) => {
  const authHeader = req.headers.authorization;
  
  // Validar token
  if (!authHeader || authHeader !== `Bearer ${MOCK_TOKEN}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { checkOutDateFrom, checkOutDateTo, limit = 10 } = req.query;

  // Datos mock (subset de la respuesta real)
  const mockReservations = [
    {
      id: 57166582,
      listingMapId: 442107,
      listingName: 'E04',
      hostawayReservationId: '57166582',
      guestName: 'Anai Calva',
      guestFirstName: 'Anai',
      guestLastName: 'Calva',
      numberOfGuests: 2,
      adults: 2,
      children: 0,
      arrivalDate: '2026-04-03',
      departureDate: '2026-04-05',
      nights: 2,
      status: 'new',
      checkInTime: 13,
      checkOutTime: 11,
      cleaningFee: 12
    },
    {
      id: 56937768,
      listingMapId: 441665,
      listingName: 'Cálido Studio junto al Metro La Pradera',
      hostawayReservationId: '56937768',
      guestName: 'Rodolfo Carvalho De Oliveira',
      guestFirstName: 'Rodolfo',
      guestLastName: 'Carvalho De Oliveira',
      numberOfGuests: 1,
      adults: 1,
      children: 0,
      arrivalDate: '2026-04-03',
      departureDate: '2026-04-21',
      nights: 18,
      status: 'new',
      checkInTime: 15,
      checkOutTime: 11,
      cleaningFee: 12
    },
    {
      id: 56505786,
      listingMapId: 439760,
      listingName: 'Estudio R306 - Edificio República',
      hostawayReservationId: '56505786',
      guestName: 'Alonzo Hidalgo',
      guestFirstName: 'Alonzo',
      guestLastName: 'Hidalgo',
      numberOfGuests: 1,
      adults: 1,
      children: 0,
      arrivalDate: '2026-04-01',
      departureDate: '2026-04-06',
      nights: 5,
      status: 'new',
      checkInTime: 15,
      checkOutTime: 11,
      cleaningFee: 12
    }
  ];

  // Filtrar por fechas si se proporcionan
  let filtered = mockReservations;
  if (checkOutDateFrom && checkOutDateTo) {
    filtered = mockReservations.filter(r => {
      return r.departureDate >= checkOutDateFrom && r.departureDate <= checkOutDateTo;
    });
  }

  // Aplicar limit
  const limited = filtered.slice(0, parseInt(limit));

  res.json({
    status: 'success',
    result: limited,
    count: filtered.length,
    limit: parseInt(limit),
    offset: null
  });
});

// ============================================
// Iniciar servidor
// ============================================
app.listen(PORT, () => {
  console.log(`✅ Mock Hostaway API corriendo en http://localhost:${PORT}`);
  console.log(`
📋 Endpoints disponibles:
  POST http://localhost:${PORT}/v1/accessTokens
  GET  http://localhost:${PORT}/v1/reservations

🧪 Prueba rápida:
  curl -X POST http://localhost:${PORT}/v1/accessTokens \\
    -H "Content-Type: application/x-www-form-urlencoded" \\
    -d "grant_type=client_credentials&client_id=test&client_secret=test&scope=general"
  `);
});
