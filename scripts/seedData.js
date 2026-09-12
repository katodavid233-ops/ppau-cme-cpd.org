const { D1Adapter } = require('../config/db');

async function main() {
  const db = new D1Adapter(null);
  const d = db._getDb();

  // Seed admin user
  const bcrypt = require('bcryptjs');
  const hash = bcrypt.hashSync('ppau-cpd2026', 10);
  d.prepare('INSERT OR IGNORE INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, ?)').run('PPAU Admin', 'katodavid233@gmail.com', hash, 'admin');

  // Seed events
  const events = [
    { title: 'POCKED SIZED SMALL SCALE MANUFACTURING BY DISPENSERS AND PHARMACY ASSISTANTS', description: 'Enabling pharmacy professionals to do small scale manufacturing in Jik, sanitizers, herbal syrups, jelly, GV Paint, iodine tincture, hydrogen peroxide, creams, ointments, medicated herbal soaps etc', location: 'ONLINE (google meet)', event_date: '2026-09-12T19:00:00', cpd_points: 4.0 },
    { title: 'FAMILY PLANNING', description: 'FAMILY PLANNING UNDER THE SELF CARE POLICY OF UGANDA.\nEnabling dispensers to provide family planning services to the public (including injectable family planning services)', location: 'BLENDED (Physical and Online)', event_date: '2026-12-11T09:00:00', cpd_points: 20.0 },
    { title: 'URINARY TRACT INFECTIONS AS COMMON HEALTH CONDITION', description: 'The CPD will improve early recognition of UTIs, promote appropriate management and referral, reduce unnecessary or inappropriate antibiotic use, strengthen antimicrobial stewardship, and improve patient safety and treatment outcomes.', location: 'ONLINE (google meet)', event_date: '2027-02-21T19:00:00', cpd_points: 12.0 },
    { title: 'VETERINARY PHARMACY PRACTICES', description: 'Exploring veterinary pharmacy.\n\nKey focus areas; Veterinary medicines, dispensing, responsible antimicrobial use in animals, animal welfare and management of common veterinary ailments, veterinary drug shops and operation, regulatory aspects.', location: 'ONLINE (google meet)', event_date: '2027-05-05T11:00:00', cpd_points: 15.0 },
    { title: 'INDUSTRIAL PHARMACY PRACTICE', description: 'Navigating pharmaceutical manufacturing responsibilities and scopes for Dispensers\n\nKey focus areas\nStores management, quality assurance, quality control, regulatory affairs, and unit operations in pharmaceutical manufacturing (milling, blending, sifting, granulation, compression, coating, packaging)', location: 'ONLINE (google meet)', event_date: '2027-07-20T11:00:00', cpd_points: 20.0 },
    { title: 'GOOD PHARMACY PRACTICES IN ALLIED HEALTH DRUG DISPENSARIES', description: 'Build a competent and compliant drug dispensary.\nKey areas; establishment and management, regulatory framework and role of stakeholders, licensing requirement and legal compliance, role of Dispensers as managers/ supervisors, human resource etc.', location: 'ONLINE (google meet)', event_date: '2027-10-02T20:00:00', cpd_points: 20.0 }
  ];

  for (const e of events) {
    const existing = d.prepare('SELECT id FROM events WHERE title = ?').get(e.title);
    if (!existing) {
      d.prepare('INSERT INTO events (title, description, location, event_date, cpd_points) VALUES (?, ?, ?, ?, ?)').run(e.title, e.description, e.location, e.event_date, e.cpd_points);
    } else {
      d.prepare('UPDATE events SET description = ?, location = ?, event_date = ?, cpd_points = ? WHERE id = ?').run(e.description, e.location, e.event_date, e.cpd_points, existing.id);
    }
  }

  // Seed settings
  d.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('cpd_target', '30');
  d.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('email_api_key', '');

  console.log('Seed complete.');
}

main().catch(e => { console.error(e); process.exit(1); });
