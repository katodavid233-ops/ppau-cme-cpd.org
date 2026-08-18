const { D1Adapter } = require('../config/db');

async function main() {
  const db = new D1Adapter(null);
  const d = db._getDb();

  // Seed admin user
  const bcrypt = require('bcryptjs');
  const hash = bcrypt.hashSync('ppau-cpd2026', 10);
  d.prepare('INSERT OR IGNORE INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, ?)').run('PPAU Admin', 'katodavid233@gmail.com', hash, 'admin');

  // Seed modules
  const modules = [
    {
      title: 'Medication Safety & Pharmacovigilance',
      description: 'Foundational CPD on safe prescribing, dispensing and adverse drug reaction reporting.',
      content: '<h4>Learning objectives</h4><p>On completion of this module the participant should be able to apply the key principles covered and answer the assessment questions.</p><p>Pass mark: 70% - points are awarded automatically on passing.</p>',
      style: 'e_learning',
      cpd_points: 4.0,
      duration_minutes: 30,
      questions: [
        { q: 'What is pharmacovigilance primarily concerned with?', a: 'Drug pricing', b: 'Adverse drug reaction detection and reporting', c: 'Drug manufacturing', d: 'Marketing pharmaceuticals', correct: 'B' },
        { q: 'Who is responsible for reporting adverse drug reactions in Uganda?', a: 'Only doctors', b: 'Only pharmacists', c: 'All healthcare professionals', d: 'Only nurses', correct: 'C' },
        { q: 'What is the minimum score required to pass a CPD assessment?', a: '50%', b: '60%', c: '70%', d: '80%', correct: 'C' },
        { q: 'Which of these is an example of an adverse drug reaction?', a: 'Intended therapeutic effect', b: 'Unexpected harmful response to a drug', c: 'Correct dosage response', d: 'Drug interaction with food', correct: 'B' }
      ]
    },
    {
      title: 'Antimicrobial Stewardship in Community Pharmacy',
      description: 'Reading review of best practice in promoting rational use of antimicrobials and tackling antimicrobial resistance (AMR).',
      content: '<h4>Learning objectives</h4><p>On completion of this module the participant should be able to apply the key principles covered and answer the assessment questions.</p><p>Pass mark: 70% - points are awarded automatically on passing.</p>',
      style: 'journal',
      cpd_points: 4.0,
      duration_minutes: 30,
      questions: [
        { q: 'What is antimicrobial stewardship?', a: 'Selling antimicrobials', b: 'Responsible use of antimicrobials to reduce resistance', c: 'Stopping all antibiotic use', d: 'Only using brand name drugs', correct: 'B' },
        { q: 'Which action best supports antimicrobial stewardship?', a: 'Prescribing antibiotics for viral infections', b: 'Completing the full course of prescribed antibiotics', c: 'Sharing antibiotics with family members', d: 'Buying antibiotics without prescription', correct: 'B' },
        { q: 'What is a key consequence of antimicrobial resistance?', a: 'Cheaper drugs', b: 'Faster recovery', c: 'Infections becoming harder to treat', d: 'Fewer side effects', correct: 'C' },
        { q: 'Community pharmacists play which role in stewardship?', a: 'They have no role', b: 'Counseling patients on appropriate antibiotic use', c: 'Prescribing antibiotics freely', d: 'Only dispensing brand names', correct: 'B' }
      ]
    },
    {
      title: 'Handling Controlled Medicines & Opioid Safety',
      description: 'Legal and safe handling of controlled substances, documentation and preventing diversion.',
      content: '<h4>Learning objectives</h4><p>On completion of this module the participant should be able to apply the key principles covered and answer the assessment questions.</p><p>Pass mark: 70% - points are awarded automatically on passing.</p>',
      style: 'e_learning',
      cpd_points: 4.0,
      duration_minutes: 25,
      questions: [
        { q: 'What is the primary purpose of controlled medicines legislation?', a: 'To increase sales', b: 'To prevent misuse and diversion while ensuring medical access', c: 'To ban all opioids', d: 'To reduce pharmacy profits', correct: 'B' },
        { q: 'What record must be maintained for controlled medicines?', a: 'No records needed', b: 'A register of all transactions with date, quantity, and recipient details', c: 'Only monthly summaries', d: 'Only annual reports', correct: 'B' },
        { q: 'Who can prescribe controlled medicines in Uganda?', a: 'Anyone', b: 'Only authorized prescribers with appropriate licenses', c: 'Only pharmacists', d: 'Only hospital managers', correct: 'B' },
        { q: 'What should you do if you suspect diversion of controlled medicines?', a: 'Ignore it', b: 'Report to relevant authorities immediately', c: 'Wait for someone else to report', d: 'Close the pharmacy', correct: 'B' }
      ]
    }
  ];

  for (const m of modules) {
    const existing = d.prepare('SELECT id FROM modules WHERE title = ?').get(m.title);
    if (existing) continue;
    const info = d.prepare('INSERT INTO modules (title, description, content, style, cpd_points, duration_minutes) VALUES (?, ?, ?, ?, ?, ?)').run(m.title, m.description, m.content, m.style, m.cpd_points, m.duration_minutes);
    const moduleId = info.lastInsertRowid;
    for (const q of m.questions) {
      d.prepare('INSERT INTO questions (module_id, question, option_a, option_b, option_c, option_d, correct_option) VALUES (?, ?, ?, ?, ?, ?, ?)').run(moduleId, q.q, q.a, q.b, q.c, q.d, q.correct);
    }
  }

  // Seed events
  const events = [
    { title: 'POCKED SIZED SMALL SCALE MANUFACTURING BY DISPENSERS AND PHARMACY ASSISTANTS', description: 'Enabling pharmacy professionals to do small scale manufacturing in Jik, sanitizers, herbal syrups, jelly, GV Paint, iodine tincture, hydrogen peroxide, creams, ointments, medicated herbal soaps etc', location: 'ONLINE (google meet)', event_date: '2026-08-22T19:00:00', cpd_points: 15.0 },
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
    }
  }

  // Seed settings
  d.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('cpd_target', '30');
  d.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('email_api_key', '');

  console.log('Seed complete.');
}

main().catch(e => { console.error(e); process.exit(1); });
