const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const CONTACTS_STATUS_FILE = path.join(__dirname, 'contacts_status.json');
const SETTINGS_FILE = path.join(__dirname, 'settings.json');
const LOGS_FILE = path.join(__dirname, 'sending_logs.txt');
const RESUME_FILE = path.join(__dirname, 'resume (10).pdf');
const ENV_FILE = path.join(__dirname, '.env');

// ── Load OAuth2 credentials from .env ───────────────────────────────────────
function getEnvVar(key) {
  try {
    const content = fs.readFileSync(ENV_FILE, 'utf-8');
    const match = content.match(new RegExp(`^${key}=(.+)$`, 'm'));
    return match ? match[1].trim() : null;
  } catch (e) { return null; }
}

const OAUTH_CLIENT_ID     = getEnvVar('client_id');
const OAUTH_CLIENT_SECRET = getEnvVar('client_secret');
const OAUTH_REFRESH_TOKEN = getEnvVar('GMAIL_REFRESH_TOKEN');

function logMessage(msg) {
  const time = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const formatted = `[${time}] ${msg}`;
  console.log(formatted);
  try {
    fs.appendFileSync(LOGS_FILE, formatted + '\n', 'utf-8');
  } catch (err) {}
}

function getSettings() {
  return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
}

function getContacts() {
  return JSON.parse(fs.readFileSync(CONTACTS_STATUS_FILE, 'utf-8'));
}

function saveContacts(contacts) {
  fs.writeFileSync(CONTACTS_STATUS_FILE, JSON.stringify(contacts, null, 2), 'utf-8');
}

function compileTemplate(text, contact) {
  if (!text) return '';
  const name      = (contact.name && contact.name.trim()) ? contact.name.trim() : 'there';
  const company   = (contact.company && contact.company.trim()) ? contact.company.trim() : 'your company';
  const title     = (contact.title && contact.title.trim()) ? contact.title.trim() : '';
  const email     = (contact.email && contact.email.trim()) ? contact.email.trim() : '';
  const vortexify = 'https://firstimpressione.netlify.app/vortexify/';
  const kainest   = 'https://firstimpressione.netlify.app/kainest/';
  const github    = 'https://github.com/keshav9926';
  const portfolio = 'https://keshav9926.github.io';

  return text
    .replace(/\{\{\s*founder_name\s*\}\}/gi, name)
    .replace(/\{\{\s*company_name\s*\}\}/gi, company)
    .replace(/\{\{\s*vortexify_report\s*\}\}/gi, vortexify)
    .replace(/\{\{\s*kainest_report\s*\}\}/gi, kainest)
    .replace(/\{\{\s*github_url\s*\}\}/gi, github)
    .replace(/\{\{\s*portfolio_url\s*\}\}/gi, portfolio)
    .replace(/{founder name}/gi, name)
    .replace(/{company name}/gi, company)
    .replace(/{name}/gi, name)
    .replace(/{company}/gi, company)
    .replace(/{title}/gi, title)
    .replace(/{email}/gi, email)
    .replace(/{sno}/gi, contact.sno || '');
}

function stripHtmlToText(htmlStr) {
  if (!htmlStr) return '';
  return htmlStr
    .replace(/<a\s+[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi, '$2 ($1)')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();
}

async function runAutomation() {
  logMessage('🚀 Starting Automated Founder Outreach Campaign from kakanikeshav0@gmail.com...');

  while (true) {
    const settings = getSettings();
    const contacts = getContacts();

    // Check daily cap
    const maxPerDay = settings.maxPerDay || 40;
    const todayPrefix = new Date().toISOString().slice(0, 10);
    const sentToday = contacts.filter(
      c => c.status === 'sent' && c.sentAt && c.sentAt.startsWith(todayPrefix)
    ).length;

    if (sentToday >= maxPerDay) {
      logMessage(`⏸ Daily send cap reached (${sentToday}/${maxPerDay} sent today). Pausing automation.`);
      break;
    }

    // Find next pending contact
    const nextIdx = contacts.findIndex(c => c.status === 'pending');
    if (nextIdx === -1) {
      logMessage('🎉 All pending contacts have been processed! Campaign complete.');
      break;
    }

    const contact = contacts[nextIdx];
    contact.status = 'sending';
    saveContacts(contacts);

    logMessage(`📧 [#${contact.sno}] Sending email to ${contact.name} (${contact.email}) at ${contact.company}...`);

    try {
      // ── Transport: OAuth2 if refresh token present, else SMTP ──────────────
      let transportConfig;
      if (OAUTH_REFRESH_TOKEN && OAUTH_CLIENT_ID && OAUTH_CLIENT_SECRET) {
        logMessage(`🔑 Using OAuth2 transport for ${settings.smtp.senderEmail}`);
        transportConfig = {
          service: 'gmail',
          auth: {
            type: 'OAuth2',
            user: settings.smtp.senderEmail,
            clientId: OAUTH_CLIENT_ID,
            clientSecret: OAUTH_CLIENT_SECRET,
            refreshToken: OAUTH_REFRESH_TOKEN
          }
        };
      } else {
        logMessage(`🔒 Using SMTP transport for ${settings.smtp.senderEmail}`);
        transportConfig = {
          host: settings.smtp.host,
          port: settings.smtp.port,
          secure: settings.smtp.secure === true || settings.smtp.port === 465,
          auth: { user: settings.smtp.user, pass: settings.smtp.pass },
          tls: { rejectUnauthorized: false }
        };
      }
      const transporter = nodemailer.createTransport(transportConfig);

      // ── Template rotation: pick T1 → T2 → T3 → T1 ... based on total sent count ──
      const templates = settings.templates || [settings.template];
      const totalSent = contacts.filter(c => c.status === 'sent').length;
      const tpl = templates[totalSent % templates.length];
      logMessage(`📝 Using Template ${(totalSent % templates.length) + 1} of ${templates.length}: "${tpl.subject.substring(0, 40)}..."`);

      const subject = compileTemplate(tpl.subject, contact);
      const textBody = compileTemplate(tpl.body, contact);

      const mailOptions = {
        from: `"${settings.smtp.senderName}" <${settings.smtp.senderEmail}>`,
        to: contact.email,
        subject: subject,
        text: textBody,
        attachments: fs.existsSync(RESUME_FILE) ? [
          {
            filename: 'Resume_Keshav_Kakani.pdf',
            content: fs.readFileSync(RESUME_FILE),
            contentType: 'application/pdf'
          }
        ] : []
      };

      const info = await transporter.sendMail(mailOptions);
      contact.status = 'sent';
      contact.sentAt = new Date().toISOString();
      contact.templateUsed = (totalSent % templates.length) + 1;
      contact.error = null;
      saveContacts(contacts);
      logMessage(`✅ SUCCESS: Sent to ${contact.email} (ID: ${info.messageId})`);

    } catch (err) {
      contact.status = 'failed';
      contact.error = err.message;
      saveContacts(contacts);
      logMessage(`❌ FAILED: Couldn't send to ${contact.email} — ${err.message}`);
    }

    // Delay calculation (45 to 90 seconds for max deliverability)
    const minDelay = settings.minDelay || 45000;
    const maxDelay = settings.maxDelay || 90000;
    const delay = settings.randomizeDelay
      ? Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay
      : (settings.delay || 60000);

    logMessage(`⏳ Waiting ${(delay / 1000).toFixed(1)}s before sending next email...\n`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

runAutomation();
