/**
 * SMTP Mailbox Verifier — Free, zero-send verification
 * Connects to the MX server, asks "does this mailbox exist?", disconnects.
 * No emails are sent. No cost.
 */

const net = require('net');
const https = require('https');
const fs = require('fs');
const path = require('path');

const CONTACTS_FILE = path.join(__dirname, 'contacts_status.json');
const RESULTS_FILE = path.join(__dirname, 'smtp_verify_results.json');

const CONCURRENCY = 8;       // parallel checks (keep low to avoid IP bans)
const TIMEOUT_MS  = 8000;    // 8s per connection
const FROM_EMAIL  = 'verify@iitj.ac.in';

// ── DoH MX lookup ────────────────────────────────────────────────────────────
function getMxHost(domain) {
  return new Promise((resolve) => {
    const url = `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`;
    https.get(url, { headers: { Accept: 'application/dns-json' } }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(d);
          if (!json.Answer || json.Answer.length === 0) return resolve(null);
          const sorted = json.Answer
            .filter(r => r.type === 15)
            .map(r => { const p = r.data.trim().split(' '); return { pri: parseInt(p[0]), host: p[1].replace(/\.$/, '') }; })
            .sort((a, b) => a.pri - b.pri);
          resolve(sorted[0]?.host || null);
        } catch { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

// ── SMTP handshake ────────────────────────────────────────────────────────────
function smtpCheck(email, mxHost) {
  return new Promise((resolve) => {
    let result = 'unknown';
    let log = [];
    let done = false;

    const finish = (res) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve({ result: res, log });
    };

    const timer = setTimeout(() => finish('timeout'), TIMEOUT_MS);

    const socket = net.createConnection(25, mxHost);
    socket.setTimeout(TIMEOUT_MS);

    let buffer = '';
    let step = 0;

    const send = (cmd) => {
      log.push('> ' + cmd);
      socket.write(cmd + '\r\n');
    };

    socket.on('connect', () => {});
    socket.on('timeout', () => finish('timeout'));
    socket.on('error', (e) => {
      clearTimeout(timer);
      // Port 25 blocked by ISP — can't verify, assume ok
      finish('unverifiable');
    });

    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\r\n');
      buffer = lines.pop(); // incomplete line back to buffer

      for (const line of lines) {
        if (!line) continue;
        log.push('< ' + line);
        const code = parseInt(line.slice(0, 3));

        if (step === 0 && code === 220) {
          step = 1;
          send(`EHLO verify.iitj.ac.in`);
        } else if (step === 1 && (code === 250 || code === 220)) {
          if (!line.includes('-')) { // last line of EHLO response
            step = 2;
            send(`MAIL FROM:<${FROM_EMAIL}>`);
          }
        } else if (step === 2 && code === 250) {
          step = 3;
          send(`RCPT TO:<${email}>`);
        } else if (step === 3) {
          clearTimeout(timer);
          send('QUIT');
          if (code === 250 || code === 251) {
            finish('valid');
          } else if (code >= 550 && code <= 554) {
            finish('invalid');
          } else if (code === 452 || code === 421) {
            finish('unverifiable'); // server busy/greylisted
          } else {
            finish('unverifiable');
          }
        } else if (code >= 500 && step < 3) {
          clearTimeout(timer);
          finish('unverifiable');
        }
      }
    });

    socket.on('close', () => {
      clearTimeout(timer);
      if (!done) finish('unverifiable');
    });
  });
}

// ── Catch-all detection ───────────────────────────────────────────────────────
async function isCatchAll(mxHost, domain) {
  // Try a definitely-nonexistent address — if server says 250, it's catch-all
  const fakeEmail = `zz_nonexistent_99xqz@${domain}`;
  const r = await smtpCheck(fakeEmail, mxHost);
  return r.result === 'valid'; // server accepts everything = catch-all
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const contacts = JSON.parse(fs.readFileSync(CONTACTS_FILE, 'utf-8'));
  const pending = contacts.filter(c => c.status === 'pending');
  console.log(`\n🔍 SMTP Verifying ${pending.length} pending email addresses...\n`);

  // Load existing results to allow resume
  let results = {};
  if (fs.existsSync(RESULTS_FILE)) {
    results = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf-8'));
    console.log(`  Resuming — ${Object.keys(results).length} already verified.\n`);
  }

  const todo = pending.filter(c => !results[c.email]);
  console.log(`  ${todo.length} remaining to check.\n`);

  // Cache MX + catch-all per domain
  const mxCache = {};
  const catchAllCache = {};

  let checked = 0;
  let valid = 0, invalid = 0, catchall = 0, unverifiable = 0;

  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    const batch = todo.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (contact) => {
      const email = contact.email;
      const domain = email.split('@')[1];

      // MX lookup
      if (!mxCache[domain]) {
        mxCache[domain] = await getMxHost(domain);
      }
      const mx = mxCache[domain];

      if (!mx) {
        results[email] = 'invalid_no_mx';
        invalid++;
        return;
      }

      // Catch-all check (once per domain)
      if (catchAllCache[domain] === undefined) {
        catchAllCache[domain] = await isCatchAll(mx, domain);
      }

      if (catchAllCache[domain]) {
        results[email] = 'catch_all';
        catchall++;
        return;
      }

      // Real SMTP check
      const { result } = await smtpCheck(email, mx);
      results[email] = result;

      if (result === 'valid') valid++;
      else if (result === 'invalid') invalid++;
      else unverifiable++;
    }));

    checked += batch.length;

    // Save progress every batch
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2), 'utf-8');

    if (checked % 50 === 0 || checked === todo.length) {
      console.log(`  [${checked}/${todo.length}] valid=${valid} invalid=${invalid} catch_all=${catchall} unverifiable=${unverifiable}`);
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n========== RESULTS ==========');
  const counts = {};
  Object.values(results).forEach(r => { counts[r] = (counts[r] || 0) + 1; });
  Object.entries(counts).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => {
    console.log(`  ${k.padEnd(20)} ${v}`);
  });

  const invalidEmails = Object.entries(results)
    .filter(([, r]) => r === 'invalid' || r === 'invalid_no_mx')
    .map(([e]) => e);

  console.log(`\n❌ Confirmed INVALID mailboxes: ${invalidEmails.length}`);
  console.log(`⚠️  Catch-all domains (unverifiable at mailbox level): ${counts['catch_all'] || 0}`);
  console.log(`\n  Marking ${invalidEmails.length} invalid contacts as 'skipped' in contacts_status.json...`);

  // Update contacts
  let skipped = 0;
  contacts.forEach(c => {
    if (invalidEmails.includes(c.email) && c.status === 'pending') {
      c.status = 'skipped';
      c.error = 'SMTP verified: mailbox does not exist';
      skipped++;
    }
  });
  fs.writeFileSync(CONTACTS_FILE, JSON.stringify(contacts, null, 2), 'utf-8');

  console.log(`✅ Done. Marked ${skipped} invalid contacts as skipped.`);
  console.log(`🎯 Remaining clean pending: ${contacts.filter(c => c.status === 'pending').length}`);
}

main().catch(console.error);
