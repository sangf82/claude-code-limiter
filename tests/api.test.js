// api.test.js — Tests for the server API endpoints
//
// Test scenarios:
//   Hook API:
//     - POST /api/v1/sync: config sync, model reporting
//     - POST /api/v1/check: limit gate, allowed/denied responses
//     - POST /api/v1/count: usage recording, credit calculation
//     - GET  /api/v1/status: full usage report
//     - POST /api/v1/register: install code exchange
//     - Auth token validation, invalid token rejection
//
//   Admin API:
//     - POST /api/admin/login: password verification, JWT issuance
//     - CRUD /api/admin/users: create, list, update, delete users
//     - PUT /api/admin/users/:id: kill, pause, reinstate
//     - GET /api/admin/usage: usage history for charts
//     - PUT /api/admin/settings: credit weight updates
//     - JWT validation, expired token rejection
//
// TODO: Implement API tests
