const BASE = process.env.BASE_URL || 'https://ppau-cme-cpd.org';

async function check(path, label) {
  try {
    const res = await fetch(BASE + path);
    const ok = res.status < 400;
    console.log(`${ok ? '✓' : '✗'} ${label} (${res.status}) ${path}`);
    return ok;
  } catch (e) {
    console.log(`✗ ${label} — ${e.message} ${path}`);
    return false;
  }
}

async function main() {
  let pass = 0, fail = 0;
  const tests = [
    ['/', 'Home page'],
    ['/member/start', 'Start page'],
    ['/member/modules', 'Modules list'],
    ['/member/events', 'Events list'],
    ['/member/self-learning', 'Self-learning'],
    ['/login', 'Login page'],
    ['/css/style.css', 'CSS'],
    ['/js/app.js', 'JS'],
    ['/images/ppau-logo.jpeg', 'PPAU logo'],
  ];
  for (const [p, l] of tests) {
    (await check(p, l)) ? pass++ : fail++;
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
