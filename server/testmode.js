// Testmodus (TEST_MODE=1): Fortschritt der Test-Anleitung und Zurücksetzen.
// Es werden KEINE Beispieldaten angelegt – alles kommt aus Ihren eigenen Eingaben und CSV-Dateien.
import { get } from './db.js';

/** Fortschritt der Schritte – abgeleitet aus dem echten Datenbestand. */
export function testStatus() {
  const has = sql => !!get(sql);
  return [
    has('SELECT 1 x FROM districts LIMIT 1'),
    has(`SELECT 1 x FROM sweeps WHERE status != 'draft' LIMIT 1`),
    has(`SELECT 1 x FROM sweeps WHERE status IN ('approved','active') LIMIT 1`),
    has(`SELECT 1 x FROM sweeps WHERE status = 'active' LIMIT 1`),
    has('SELECT 1 x FROM households LIMIT 1'),
    has('SELECT 1 x FROM campaigns WHERE sent_at IS NOT NULL LIMIT 1'),
    has(`SELECT 1 x FROM residents WHERE status = 'verified' LIMIT 1`),
    has(`SELECT 1 x FROM bookings WHERE status = 'booked' OR visit IS NOT NULL LIMIT 1`),
    has('SELECT 1 x FROM route_days LIMIT 1'),
    has('SELECT 1 x FROM bookings WHERE visit IS NOT NULL LIMIT 1')
  ];
}
