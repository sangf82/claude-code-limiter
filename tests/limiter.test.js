// limiter.test.js — Tests for the limit evaluation engine (src/server/services/limiter.js)
//
// Test scenarios:
//   - Credit budget: single budget across models, various windows
//   - Per-model caps: hard caps with daily/weekly/monthly/sliding_24h
//   - Time-of-day rules: timezone-aware time window enforcement
//   - Rule stacking: multiple rules on same user, first deny wins
//   - Edge cases: unlimited (-1), blocked (0), user killed/paused
//   - Window boundary calculations (midnight, Monday, 1st of month)
//
// TODO: Implement limiter tests
