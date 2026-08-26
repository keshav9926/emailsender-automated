const fs = require('fs');
const path = require('path');
const net = require('net');
const dns = require('dns');

const CONTACTS_FILE = path.join(__dirname, 'contacts_status.json');
const CSV_FILE = 'C:\\Users\\Keshav Kakani\\Desktop\\PROJECTS\\job_search\\TO_MAIL_INDIA_FOUNDERS.xlsx';

const mxCache = {};
const catchAllCache = {};

function getMxHost(domain) {
  if (!mxCache[domain]) {
    mxCache[domain] = new Promise((resolve) => {
      let done = false;
      const timer = setTimeout(() => { if (!done) { done = true; resolve(null); } }, 4000);
      dns.promises.resolveMx(domain)
        .then(records => {
          if (done) return;
          done = true; clearTimeout(timer);
          if (!records || records.length === 0) return resolve(null);
          records.sort((a, b) => a.priority - b.priority);
          resolve(records[0].exchange);
        })
        .catch(() => {
          if (done) return;
          done = true; clearTimeout(timer);
          resolve(null);
        });
    });
  }
  return mxCache[domain];
}

function checkCatchAll(domain, mxHost) {
  if (!(domain in catchAllCache)) {
    catchAllCache[domain] = new Promise((resolve) => {
      let done = false;
      let socket;
      const fakeEmail = `nonexistent_random_chk_998877@${domain}`;

      const finish = (isCA) => {
        if (done) return;
        done = true;
        if (socket) { try { socket.destroy(); } catch (e) {} }
        resolve(isCA);
      };

      const timer = setTimeout(() => finish(false), 3500);

      try {
        socket = net.createConnection(25, mxHost);
        socket.setTimeout(3000);
        let step = 0, buffer = '';
        const send = (cmd) => { try { socket.write(cmd + '\r\n'); } catch (e) {} };

        socket.on('error', () => { clearTimeout(timer); finish(false); });
        socket.on('timeout', () => { clearTimeout(timer); finish(false); });

        socket.on('data', (chunk) => {
          buffer += chunk.toString();
          const lns = buffer.split('\r\n');
          buffer = lns.pop();

          for (const line of lns) {
            if (!line) continue;
            const code = parseInt(line.slice(0, 3));
            if (step === 0 && code === 220) {
              step = 1; send('EHLO verify.iitj.ac.in');
            } else if (step === 1 && (code === 250 || code === 220)) {
              if (!line.includes('-')) { step = 2; send('MAIL FROM:<verify@iitj.ac.in>'); }
            } else if (step === 2 && code === 250) {
              step = 3; send(`RCPT TO:<${fakeEmail}>`);
            } else if (step === 3) {
              clearTimeout(timer);
              send('QUIT');
              finish(code === 250 || code === 251);
            }
          }
        });
      } catch (e) {
        clearTimeout(timer);
        finish(false);
      }
    });
  }
  return catchAllCache[domain];
}

function verifyMailbox(email, mxHost) {
  return new Promise((resolve) => {
    let done = false;
    let socket;

    const finish = (res, details) => {
      if (done) return;
      done = true;
      if (socket) { try { socket.destroy(); } catch (e) {} }
      resolve({ status: res, details });
    };

    const timer = setTimeout(() => finish('unverifiable', 'Timeout'), 3500);

    try {
      socket = net.createConnection(25, mxHost);
      socket.setTimeout(3000);
      let step = 0, buffer = '';
      const send = (cmd) => { try { socket.write(cmd + '\r\n'); } catch (e) {} };

      socket.on('error', (e) => { clearTimeout(timer); finish('unverifiable', e.message); });
      socket.on('timeout', () => { clearTimeout(timer); finish('unverifiable', 'Timeout'); });

      socket.on('data', (chunk) => {
        buffer += chunk.toString();
        const lns = buffer.split('\r\n');
        buffer = lns.pop();

        for (const line of lns) {
          if (!line) continue;
          const code = parseInt(line.slice(0, 3));
          if (step === 0 && code === 220) {
            step = 1; send('EHLO verify.iitj.ac.in');
          } else if (step === 1 && (code === 250 || code === 220)) {
            if (!line.includes('-')) { step = 2; send('MAIL FROM:<verify@iitj.ac.in>'); }
          } else if (step === 2 && code === 250) {
            step = 3; send(`RCPT TO:<${email}>`);
          } else if (step === 3) {
            clearTimeout(timer);
            send('QUIT');
            if (code === 250 || code === 251) {
              finish('valid', 'Mailbox confirmed 250 OK');
            } else if (code >= 550 && code <= 554) {
              finish('invalid', `Mailbox does not exist (${line})`);
            } else {
              finish('unverifiable', `SMTP code ${code}`);
            }
          }
        }
      });
    } catch (e) {
      clearTimeout(timer);
      finish('unverifiable', e.message);
    }
  });
}

async function main() {
  const contacts = JSON.parse(fs.readFileSync(CONTACTS_FILE, 'utf-8'));
  const pending = contacts.filter(c => c.status === 'pending');
  console.log(`\n🔍 Auditing ${pending.length} pending contacts with System DNS & Catch-All Verification...\n`);

  let validCount = 0;
  let skippedCatchAllGuessed = 0;
  let skippedInvalid = 0;
  let skippedNoMx = 0;

  const CONCURRENCY = 10;

  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const batch = pending.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (contact) => {
      const email = contact.email;
      const domain = email.split('@')[1];
      const emailType = contact.email_type || '';

      if (!domain) {
        contact.status = 'skipped';
        contact.error = 'Invalid email syntax';
        skippedInvalid++;
        return;
      }

      const mx = await getMxHost(domain);
      if (!mx) {
        // If email type is explicitly verified (LinkedIn-verified, DB-verified), don't mark skipped unless confirmed dead
        if (emailType.includes('LinkedIn') || emailType.includes('DB-verified') || emailType.includes('SMTP-verified')) {
          contact.smtp_verification = 'unverifiable';
          validCount++;
        } else {
          contact.status = 'skipped';
          contact.error = 'No MX records for domain';
          skippedNoMx++;
        }
        return;
      }

      const isCA = await checkCatchAll(domain, mx);
      contact.is_catch_all = isCA;

      if (isCA) {
        if (emailType.includes('likely') || emailType.includes('first@')) {
          contact.status = 'skipped';
          contact.error = `Skipped: Guessed handle on Catch-All domain (${domain})`;
          skippedCatchAllGuessed++;
          return;
        }
      }

      const res = await verifyMailbox(email, mx);
      contact.smtp_verification = res.status;

      if (res.status === 'invalid') {
        contact.status = 'skipped';
        contact.error = res.details;
        skippedInvalid++;
      } else {
        validCount++;
      }
    }));

    fs.writeFileSync(CONTACTS_FILE, JSON.stringify(contacts, null, 2), 'utf-8');
    const processed = Math.min(i + CONCURRENCY, pending.length);
    console.log(` Progress [${processed}/${pending.length}] -> valid: ${validCount} | skipped_catchall_guessed: ${skippedCatchAllGuessed} | skipped_invalid: ${skippedInvalid} | skipped_no_mx: ${skippedNoMx}`);
  }

  console.log('\n================ AUDIT SUMMARY ================');
  console.log(`  Confirmed Valid / Verified Mailboxes: ${validCount}`);
  console.log(`  Skipped Guessed Handles on Catch-All Domains: ${skippedCatchAllGuessed}`);
  console.log(`  Skipped Invalid / Non-existent Mailboxes: ${skippedInvalid}`);
  console.log(`  Skipped No-MX Domains: ${skippedNoMx}`);
  console.log(`  Clean Remaining Pending: ${contacts.filter(c => c.status === 'pending').length}`);
}

main().catch(console.error);
