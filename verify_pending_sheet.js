const fs = require('fs');
const path = require('path');
const net = require('net');
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);

const CONTACTS_FILE = path.join(__dirname, 'contacts_status.json');
const CONCURRENCY = 25;

const mxCache = {};

function getMxHost(domain) {
  if (!mxCache[domain]) {
    mxCache[domain] = new Promise((resolve) => {
      let done = false;
      const timer = setTimeout(() => {
        if (!done) { done = true; resolve(null); }
      }, 2500);

      dns.promises.resolveMx(domain)
        .then(records => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          if (!records || records.length === 0) return resolve(null);
          records.sort((a, b) => a.priority - b.priority);
          resolve(records[0].exchange);
        })
        .catch(() => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(null);
        });
    });
  }
  return mxCache[domain];
}

function smtpCheckMailbox(email, mxHost) {
  return new Promise((resolve) => {
    let done = false;
    let socket;

    const finish = (res, details) => {
      if (done) return;
      done = true;
      if (socket) {
        try { socket.destroy(); } catch (e) {}
      }
      resolve({ status: res, details });
    };

    const hardTimer = setTimeout(() => finish('unverifiable', 'Hard Timeout'), 3500);

    try {
      socket = net.createConnection(25, mxHost);
      socket.setTimeout(3000);

      let step = 0;
      let buffer = '';

      const send = (cmd) => {
        try { socket.write(cmd + '\r\n'); } catch (e) {}
      };

      socket.on('error', (e) => { clearTimeout(hardTimer); finish('unverifiable', e.message); });
      socket.on('timeout', () => { clearTimeout(hardTimer); finish('unverifiable', 'Timeout'); });

      socket.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\r\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line) continue;
          const code = parseInt(line.slice(0, 3));
          if (step === 0 && code === 220) {
            step = 1; send('EHLO verify.iitj.ac.in');
          } else if (step === 1 && (code === 250 || code === 220)) {
            if (!line.includes('-')) { step = 2; send('MAIL FROM:<verify@iitj.ac.in>'); }
          } else if (step === 2 && code === 250) {
            step = 3; send(`RCPT TO:<${email}>`);
          } else if (step === 3) {
            clearTimeout(hardTimer);
            send('QUIT');
            if (code === 250 || code === 251) {
              finish('valid', 'Mailbox confirmed 250 OK');
            } else if (code >= 550 && code <= 554) {
              finish('invalid', `Mailbox does not exist (SMTP response: ${line})`);
            } else {
              finish('unverifiable', `SMTP code ${code}`);
            }
          } else if (code >= 500 && step < 3) {
            clearTimeout(hardTimer);
            finish('unverifiable', `SMTP error code ${code}`);
          }
        }
      });
    } catch (err) {
      clearTimeout(hardTimer);
      finish('unverifiable', err.message);
    }
  });
}

async function main() {
  const contacts = JSON.parse(fs.readFileSync(CONTACTS_FILE, 'utf-8'));
  const pending = contacts.filter(c => c.status === 'pending');
  console.log(`\n🔍 Verifying ${pending.length} pending sheet contacts via fast parallel SMTP Handshake...\n`);

  let validCount = 0;
  let invalidCount = 0;
  let unverifiableCount = 0;
  let noMxCount = 0;

  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const batch = pending.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (contact) => {
      const email = contact.email;
      const domain = email.split('@')[1];

      if (!domain) {
        contact.status = 'skipped';
        contact.error = 'Invalid email syntax';
        invalidCount++;
        return;
      }

      const mx = await getMxHost(domain);
      if (!mx) {
        contact.status = 'skipped';
        contact.error = 'No MX records found for domain';
        noMxCount++;
        return;
      }

      const res = await smtpCheckMailbox(email, mx);
      contact.smtp_verification = res.status;
      contact.smtp_details = res.details;

      if (res.status === 'valid') {
        validCount++;
      } else if (res.status === 'invalid') {
        contact.status = 'skipped';
        contact.error = res.details;
        invalidCount++;
      } else {
        unverifiableCount++;
      }
    }));

    fs.writeFileSync(CONTACTS_FILE, JSON.stringify(contacts, null, 2), 'utf-8');
    const processed = Math.min(i + CONCURRENCY, pending.length);
    console.log(` Progress [${processed}/${pending.length}] -> valid: ${validCount} | invalid (skipped): ${invalidCount} | no_mx: ${noMxCount} | unverifiable: ${unverifiableCount}`);
  }

  console.log('\n================ VERIFICATION COMPLETE ================');
  console.log(`  Valid mailboxes confirmed (250 OK): ${validCount}`);
  console.log(`  Invalid / Non-existent mailboxes (Skipped): ${invalidCount}`);
  console.log(`  Domains with no MX records (Skipped): ${noMxCount}`);
  console.log(`  Catch-all / Unverifiable mailboxes: ${unverifiableCount}`);
  console.log(`  Clean remaining pending: ${contacts.filter(c => c.status === 'pending').length}`);
}

main().catch(console.error);
