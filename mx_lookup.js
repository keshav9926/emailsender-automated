const https = require('https');
const fs = require('fs');
const path = require('path');

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1IsLpjhD7BGSXzjqdkqWu1CD0z1R3ANx-U19y_zqPaE0/gviz/tq?tqx=out:csv&gid=34506927';

function fetchURL(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'Accept': 'application/dns-json' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function mxLookupDoH(domain) {
  try {
    const url = `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`;
    const raw = await fetchURL(url);
    const json = JSON.parse(raw);
    if (!json.Answer || json.Answer.length === 0) return [];
    return json.Answer
      .filter(r => r.type === 15)
      .map(r => {
        const parts = r.data.trim().split(' ');
        return { priority: parseInt(parts[0]), exchange: parts[1] };
      });
  } catch (e) {
    return null;
  }
}

function classifyProvider(mxRecords) {
  if (mxRecords === null) return 'Lookup Failed';
  if (!mxRecords || mxRecords.length === 0) return 'No MX Records';
  const mx = mxRecords.map(r => r.exchange.toLowerCase()).join(' ');
  if (mx.includes('google') || mx.includes('aspmx') || mx.includes('googlemail')) return 'Google Workspace';
  if (mx.includes('outlook') || mx.includes('microsoft') || mx.includes('protection.outlook') || mx.includes('mail.protection')) return 'Microsoft 365 / Outlook';
  if (mx.includes('mimecast')) return 'Mimecast';
  if (mx.includes('proofpoint') || mx.includes('pphosted')) return 'Proofpoint';
  if (mx.includes('zoho')) return 'Zoho Mail';
  if (mx.includes('amazonses') || mx.includes('aws')) return 'Amazon SES';
  if (mx.includes('yahoo') || mx.includes('ymail')) return 'Yahoo';
  if (mx.includes('mailgun')) return 'Mailgun';
  if (mx.includes('sendgrid')) return 'SendGrid';
  if (mx.includes('fastmail')) return 'Fastmail';
  if (mx.includes('icloud') || mx.includes('apple')) return 'Apple iCloud';
  if (mx.includes('emailsrvr') || mx.includes('rackspace')) return 'Rackspace';
  if (mx.includes('barracuda')) return 'Barracuda';
  if (mx.includes('messagelabs') || mx.includes('symantec')) return 'Symantec/MessageLabs';
  if (mx.includes('forcepoint')) return 'Forcepoint';
  if (mx.includes('godaddy') || mx.includes('secureserver')) return 'GoDaddy';
  const firstMx = mxRecords[0]?.exchange || '';
  return `Other / Self-hosted (${firstMx})`;
}

function parseCSV(csv) {
  const lines = csv.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].match(/(".*?"|[^,]+|(?<=,)(?=,)|^(?=,)|(?<=,)$)/g) || [];
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = (cols[idx] || '').replace(/"/g, '').trim();
    });
    rows.push(row);
  }
  return rows;
}

async function main() {
  console.log('📥 Fetching Google Sheet...');
  const csv = await fetchURL(SHEET_URL);
  const rows = parseCSV(csv);

  const emailCol = Object.keys(rows[0]).find(k => k.includes('email') || k.includes('mail'));
  console.log(`📋 Email column: "${emailCol}"`);

  const emails = rows
    .map(r => (r[emailCol] || '').trim().toLowerCase())
    .filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

  console.log(`✅ Total valid emails: ${emails.length}`);

  const domains = [...new Set(emails.map(e => e.split('@')[1]))].sort();
  console.log(`🌐 Unique domains to resolve: ${domains.length}`);
  console.log('---');

  // Lookup with DoH, concurrency 15, rate-limited
  const results = {};
  const CONCURRENCY = 15;
  for (let i = 0; i < domains.length; i += CONCURRENCY) {
    const batch = domains.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(async (domain) => {
      const records = await mxLookupDoH(domain);
      return { domain, provider: classifyProvider(records), mx: records ? records.map(r => r.exchange).join(', ') : 'error' };
    }));
    batchResults.forEach(r => { results[r.domain] = r; });
    if ((i + CONCURRENCY) % 100 === 0 || i + CONCURRENCY >= domains.length) {
      console.log(`  Resolved ${Math.min(i + CONCURRENCY, domains.length)} / ${domains.length} domains...`);
    }
    await new Promise(r => setTimeout(r, 100)); // small pause between batches
  }

  // Aggregate provider counts (by domain)
  const domainResults = Object.values(results);
  const providerByDomain = {};
  domainResults.forEach(r => {
    providerByDomain[r.provider] = (providerByDomain[r.provider] || 0) + 1;
  });

  // Aggregate by email count
  const emailBreakdown = emails.map(email => {
    const domain = email.split('@')[1];
    const info = results[domain] || { provider: 'Unknown', mx: '' };
    return { email, domain, provider: info.provider, mx: info.mx };
  });

  const providerByEmail = {};
  emailBreakdown.forEach(r => {
    providerByEmail[r.provider] = (providerByEmail[r.provider] || 0) + 1;
  });

  console.log('\n========== PROVIDER SUMMARY BY UNIQUE DOMAIN COUNT ==========');
  Object.entries(providerByDomain).sort((a,b)=>b[1]-a[1]).forEach(([p,c]) => {
    const pct = ((c/domains.length)*100).toFixed(1);
    console.log(`  ${p.padEnd(45)} ${String(c).padStart(4)} domains  (${pct}%)`);
  });
  console.log(`  ${'TOTAL'.padEnd(45)} ${String(domains.length).padStart(4)} domains`);

  console.log('\n========== PROVIDER SUMMARY BY EMAIL COUNT ==========');
  Object.entries(providerByEmail).sort((a,b)=>b[1]-a[1]).forEach(([p,c]) => {
    const pct = ((c/emails.length)*100).toFixed(1);
    console.log(`  ${p.padEnd(45)} ${String(c).padStart(5)} emails  (${pct}%)`);
  });
  console.log(`  ${'TOTAL'.padEnd(45)} ${String(emails.length).padStart(5)} emails`);

  // Save CSV
  const csvOut = ['email,domain,provider,mx_records']
    .concat(emailBreakdown.map(r => `${r.email},${r.domain},"${r.provider}","${r.mx}"`))
    .join('\n');
  fs.writeFileSync(path.join(__dirname, 'mx_lookup_results.csv'), csvOut, 'utf-8');
  fs.writeFileSync(path.join(__dirname, 'mx_lookup_domains.json'), JSON.stringify(domainResults, null, 2), 'utf-8');

  console.log('\n✅ Full results saved to:');
  console.log('   mx_lookup_results.csv  (per-email breakdown)');
  console.log('   mx_lookup_domains.json (per-domain raw MX data)');
}

main().catch(console.error);
