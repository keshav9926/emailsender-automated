const fs = require('fs');
const path = require('path');
const https = require('https');

const CONTACTS_STATUS_FILE = path.join(__dirname, 'contacts_status.json');

function fetchDoH(domain) {
  return new Promise((resolve) => {
    const url = `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`;
    https.get(url, { headers: { 'Accept': 'application/dns-json' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.Answer && json.Answer.length > 0) {
            resolve(true);
          } else {
            resolve(false);
          }
        } catch (e) {
          resolve(false);
        }
      });
    }).on('error', () => resolve(false));
  });
}

async function run() {
  console.log('🔍 Loading contacts from contacts_status.json...');
  const contacts = JSON.parse(fs.readFileSync(CONTACTS_STATUS_FILE, 'utf-8'));
  console.log(`📋 Total Contacts in Database: ${contacts.length}`);

  // Extract unique domains
  const domainMap = {};
  contacts.forEach(c => {
    if (c.email && c.email.includes('@')) {
      const domain = c.email.split('@')[1].trim().toLowerCase();
      if (!domainMap[domain]) domainMap[domain] = [];
      domainMap[domain].push(c);
    }
  });

  const domains = Object.keys(domainMap);
  console.log(`🌐 Total Unique Domains to Resolve: ${domains.length}`);

  const invalidDomains = new Set();
  const CONCURRENCY = 25;

  for (let i = 0; i < domains.length; i += CONCURRENCY) {
    const batch = domains.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (domain) => {
      const hasMx = await fetchDoH(domain);
      if (!hasMx) {
        invalidDomains.add(domain);
      }
    }));
  }

  console.log(`\n❌ Found ${invalidDomains.size} Dead/Invalid Domains with NO MX Records:`);
  Array.from(invalidDomains).forEach(d => console.log(`   - ${d}`));

  let skippedCount = 0;
  contacts.forEach(c => {
    if (c.email && c.email.includes('@')) {
      const domain = c.email.split('@')[1].trim().toLowerCase();
      if (invalidDomains.has(domain)) {
        if (c.status === 'pending') {
          c.status = 'skipped';
          c.error = `Auto-filtered: Domain "${domain}" has no active MX mail servers`;
          skippedCount++;
        }
      }
    } else if (c.status === 'pending') {
      c.status = 'skipped';
      c.error = 'Auto-filtered: Invalid email syntax';
      skippedCount++;
    }
  });

  fs.writeFileSync(CONTACTS_STATUS_FILE, JSON.stringify(contacts, null, 2), 'utf-8');
  console.log(`\n✅ UPDATED DATABASE: ${skippedCount} contacts with invalid/dead domains were automatically flagged as "skipped".`);
  console.log(`🎯 Remaining Clean & Valid Contacts: ${contacts.filter(c => c.status === 'pending').length}`);
}

run();
