const express = require('express');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// File paths
const CONTACTS_FILE = path.join(__dirname, 'contacts.json');
const STATUS_FILE = path.join(__dirname, 'contacts_status.json');
const SETTINGS_FILE = path.join(__dirname, 'settings.json');
const LOGS_FILE = path.join(__dirname, 'sending_logs.txt');

// State in memory
let queueState = {
  status: 'stopped', // 'sending', 'paused', 'stopped'
  currentIndex: 0,
  delay: 10000,      // default 10 seconds delay
  logs: [],
  activeSending: false
};

// Helper: Append to log file and memory logs
function logMessage(message) {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const formatted = `[${timestamp}] ${message}`;
  queueState.logs.unshift(formatted);
  if (queueState.logs.length > 500) {
    queueState.logs.pop();
  }
  
  try {
    fs.appendFileSync(LOGS_FILE, formatted + '\n', 'utf-8');
  } catch (err) {
    console.error('Error writing to log file:', err);
  }
  console.log(formatted);
}

// Helper: Load settings
function getSettings() {
  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    } catch (e) {
      return getDefaultSettings();
    }
  }
  return getDefaultSettings();
}

function getDefaultSettings() {
  return {
    smtp: {
      host: '',
      port: 587,
      secure: false, // true for 465, false for other ports
      user: '',
      pass: '',
      senderName: 'Keshav',
      senderEmail: ''
    },
    template: {
      subject: 'IIT Jodhpur | SWE/Backend + AI Intern — shipped full-stack production apps',
      body: `Hi {name},\n\nQuick one — I'm Keshav, pre-final year B.Tech at IIT Jodhpur. I build backend systems and AI-powered products end to end.\n\nWhat I've shipped:\n→ REST APIs & microservices with Node.js / FastAPI (production-deployed)\n→ RAG pipeline + AI agent with LLM tool-calling on top of a backend I built\n→ Full-stack apps from database design to deployment — no hand-holding\n\nI'm comfortable across the stack but strongest in backend engineering and AI integration — the intersection most companies are actively hiring for right now.\n\nI'd love to explore any SWE, Backend, or AI/ML internship roles at {company}. Resume attached.\n\nIf there's a fit, even a 10-minute call works great.\n\nThanks,\nKeshav Kakani\nIIT Jodhpur | kkakani160@gmail.com`
    },
    delay: 10000 // 10 seconds
  };
}

// Helper: Save settings
function saveSettings(settings) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
}

// Helper: Load contacts with status
function getContactsStatus() {
  if (!fs.existsSync(STATUS_FILE)) {
    // If status file doesn't exist, create it from contacts.json
    if (fs.existsSync(CONTACTS_FILE)) {
      try {
        const rawContacts = JSON.parse(fs.readFileSync(CONTACTS_FILE, 'utf-8'));
        const initialized = rawContacts.map(c => ({
          ...c,
          status: 'pending', // 'pending', 'sending', 'sent', 'failed', 'skipped'
          sentAt: null,
          error: null
        }));
        fs.writeFileSync(STATUS_FILE, JSON.stringify(initialized, null, 2), 'utf-8');
        return initialized;
      } catch (e) {
        logMessage('Error initializing contacts status: ' + e.message);
        return [];
      }
    } else {
      return [];
    }
  }
  
  try {
    return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf-8'));
  } catch (e) {
    logMessage('Error reading contacts status file, returning empty array.');
    return [];
  }
}

// Helper: Save contacts status
function saveContactsStatus(contacts) {
  try {
    fs.writeFileSync(STATUS_FILE, JSON.stringify(contacts, null, 2), 'utf-8');
  } catch (err) {
    logMessage('Error saving contacts status: ' + err.message);
  }
}

// SMTP Transporter builder
function createTransporter(smtpSettings) {
  if (!smtpSettings.host || !smtpSettings.user || !smtpSettings.pass) {
    throw new Error('SMTP credentials are not fully configured.');
  }
  
  return nodemailer.createTransport({
    host: smtpSettings.host,
    port: parseInt(smtpSettings.port),
    secure: smtpSettings.secure === true || smtpSettings.port === 465 || smtpSettings.secure === 'true',
    auth: {
      user: smtpSettings.user,
      pass: smtpSettings.pass
    },
    tls: {
      rejectUnauthorized: false // Helps avoid self-signed cert issues
    }
  });
}

// Template compiler
function compileTemplate(text, contact) {
  if (!text) return '';
  return text
    .replace(/{name}/gi, contact.name || '')
    .replace(/{email}/gi, contact.email || '')
    .replace(/{title}/gi, contact.title || '')
    .replace(/{company}/gi, contact.company || '')
    .replace(/{sno}/gi, contact.sno || '');
}

// Queue sending process
let queueTimeoutId = null;

async function sendNextEmail() {
  if (queueState.status !== 'sending') {
    queueState.activeSending = false;
    return;
  }
  
  queueState.activeSending = true;
  const contacts = getContactsStatus();
  const settings = getSettings();
  
  // Find the first pending contact
  const nextContactIndex = contacts.findIndex(c => c.status === 'pending');
  
  if (nextContactIndex === -1) {
    logMessage('All pending emails have been processed!');
    queueState.status = 'stopped';
    queueState.activeSending = false;
    return;
  }
  
  const contact = contacts[nextContactIndex];
  queueState.currentIndex = nextContactIndex;
  
  // Update status to sending in-memory and in file
  contacts[nextContactIndex].status = 'sending';
  saveContactsStatus(contacts);
  
  logMessage(`Attempting to send email to ${contact.name} (${contact.email}) at ${contact.company}`);
  
  try {
    const transporter = createTransporter(settings.smtp);
    const subject = compileTemplate(settings.template.subject, contact);
    const body = compileTemplate(settings.template.body, contact);
    const fromName = settings.smtp.senderName || 'Sender';
    const fromEmail = settings.smtp.senderEmail || settings.smtp.user;
    
    // Check if the body looks like HTML
    const isHtml = /<[a-z][\s\S]*>/i.test(body);
    
    const mailOptions = {
      from: `"${fromName}" <${fromEmail}>`,
      to: contact.email,
      subject: subject,
      [isHtml ? 'html' : 'text']: body
    };
    
    // Auto-detect and attach resume (10).pdf if it exists in current directory
    const resumePath = path.join(__dirname, 'resume (10).pdf');
    if (fs.existsSync(resumePath)) {
      mailOptions.attachments = [
        {
          filename: 'Resume_Keshav_Kakani.pdf',
          path: resumePath
        }
      ];
    }
    
    await transporter.sendMail(mailOptions);
    
    // Success
    contacts[nextContactIndex].status = 'sent';
    contacts[nextContactIndex].sentAt = new Date().toISOString();
    contacts[nextContactIndex].error = null;
    saveContactsStatus(contacts);
    logMessage(`SUCCESS: Email sent to ${contact.email}`);
    
  } catch (error) {
    // Failure
    contacts[nextContactIndex].status = 'failed';
    contacts[nextContactIndex].error = error.message;
    saveContactsStatus(contacts);
    logMessage(`FAILURE: Failed to send to ${contact.email}. Error: ${error.message}`);
  }
  
  // Wait for the configured delay before sending the next one
  const delayTime = settings.delay || queueState.delay;
  logMessage(`Waiting ${delayTime / 1000} seconds before next email...`);
  
  queueTimeoutId = setTimeout(() => {
    sendNextEmail();
  }, delayTime);
}

// REST APIs

// 1. Get current queue status and logs
app.get('/api/status', (req, res) => {
  const contacts = getContactsStatus();
  const total = contacts.length;
  const sent = contacts.filter(c => c.status === 'sent').length;
  const failed = contacts.filter(c => c.status === 'failed').length;
  const skipped = contacts.filter(c => c.status === 'skipped').length;
  const pending = contacts.filter(c => c.status === 'pending').length;
  const sending = contacts.filter(c => c.status === 'sending').length;
  
  res.json({
    status: queueState.status,
    currentIndex: queueState.currentIndex,
    logs: queueState.logs,
    stats: {
      total,
      sent,
      failed,
      skipped,
      pending,
      sending
    }
  });
});

// 2. Control the queue (start, pause, reset, skip)
app.post('/api/control', (req, res) => {
  const { action } = req.body;
  
  if (action === 'start') {
    if (queueState.status !== 'sending') {
      const settings = getSettings();
      if (!settings.smtp.host || !settings.smtp.user || !settings.smtp.pass) {
        return res.status(400).json({ error: 'SMTP settings are not configured. Please complete settings first.' });
      }
      
      queueState.status = 'sending';
      logMessage('Queue started by user.');
      
      // If a sending contact was left in-process from a crash, reset it back to pending so we retry
      const contacts = getContactsStatus();
      let modified = false;
      contacts.forEach(c => {
        if (c.status === 'sending') {
          c.status = 'pending';
          modified = true;
        }
      });
      if (modified) saveContactsStatus(contacts);

      if (!queueState.activeSending) {
        sendNextEmail();
      }
    }
    return res.json({ success: true, status: queueState.status });
  }
  
  if (action === 'pause') {
    queueState.status = 'paused';
    if (queueTimeoutId) {
      clearTimeout(queueTimeoutId);
      queueTimeoutId = null;
    }
    queueState.activeSending = false;
    logMessage('Queue paused by user.');
    
    // Revert any currently "sending" contact back to pending
    const contacts = getContactsStatus();
    let modified = false;
    contacts.forEach(c => {
      if (c.status === 'sending') {
        c.status = 'pending';
        modified = true;
      }
    });
    if (modified) saveContactsStatus(contacts);

    return res.json({ success: true, status: queueState.status });
  }
  
  if (action === 'reset') {
    queueState.status = 'stopped';
    if (queueTimeoutId) {
      clearTimeout(queueTimeoutId);
      queueTimeoutId = null;
    }
    queueState.activeSending = false;
    queueState.currentIndex = 0;
    
    // Reset all statuses in file back to pending (except skipped ones if user wants, but here we reset failed and sent as well)
    const contacts = getContactsStatus();
    contacts.forEach(c => {
      if (c.status !== 'skipped') {
        c.status = 'pending';
        c.sentAt = null;
        c.error = null;
      }
    });
    saveContactsStatus(contacts);
    logMessage('Queue reset. All non-skipped contacts set back to pending.');
    return res.json({ success: true, status: queueState.status });
  }

  res.status(400).json({ error: 'Invalid action.' });
});

// 3. Get all contacts (supports search and pagination in frontend, here we return full)
app.get('/api/contacts', (req, res) => {
  res.json(getContactsStatus());
});

// 4. Toggle skip on a contact
app.post('/api/contacts/toggle-skip', (req, res) => {
  const { sno, skip } = req.body;
  const contacts = getContactsStatus();
  const idx = contacts.findIndex(c => c.sno === parseInt(sno));
  
  if (idx !== -1) {
    const contact = contacts[idx];
    if (skip) {
      contact.status = 'skipped';
    } else {
      if (contact.status === 'skipped') {
        contact.status = 'pending';
      }
    }
    saveContactsStatus(contacts);
    return res.json({ success: true, contact });
  }
  
  res.status(404).json({ error: 'Contact not found.' });
});

// 5. Get settings
app.get('/api/settings', (req, res) => {
  res.json(getSettings());
});

// 6. Save settings
app.post('/api/settings', (req, res) => {
  const newSettings = req.body;
  saveSettings(newSettings);
  // Update in-memory queue delay
  queueState.delay = newSettings.delay || 10000;
  res.json({ success: true, settings: newSettings });
});

// 7. Test connection and send a test email
app.post('/api/test-connection', async (req, res) => {
  const { smtp, testEmail } = req.body;
  
  if (!smtp.host || !smtp.user || !smtp.pass) {
    return res.status(400).json({ error: 'Incomplete SMTP credentials.' });
  }
  
  if (!testEmail) {
    return res.status(400).json({ error: 'Test recipient email is required.' });
  }
  
  logMessage(`Running SMTP connection test for server ${smtp.host}...`);
  
  try {
    const transporter = createTransporter(smtp);
    
    // Verify connection configuration
    await transporter.verify();
    logMessage(`SMTP verification successful. Sending test email to ${testEmail}...`);
    
    const fromName = smtp.senderName || 'SMTP Test Sender';
    const fromEmail = smtp.senderEmail || smtp.user;
    
    const mailOptions = {
      from: `"${fromName}" <${fromEmail}>`,
      to: testEmail,
      subject: 'Email Sender Automation Test Connection',
      text: `Hello!\n\nThis is a test email from your local PDF Email Sender application. Your SMTP settings are successfully configured and verified.\n\nDate: ${new Date().toLocaleString()}`
    };
    
    // Auto-detect and attach resume (10).pdf if it exists in current directory
    const resumePath = path.join(__dirname, 'resume (10).pdf');
    if (fs.existsSync(resumePath)) {
      mailOptions.attachments = [
        {
          filename: 'Resume_Keshav_Kakani.pdf',
          path: resumePath
        }
      ];
    }
    
    const info = await transporter.sendMail(mailOptions);
    logMessage(`Test email sent successfully! MessageID: ${info.messageId}`);
    res.json({ success: true, message: 'Connection verified and test email sent successfully!' });
    
  } catch (err) {
    logMessage(`Test SMTP failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// 8. Re-parse PDF if needed
app.post('/api/import-pdf', (req, res) => {
  logMessage('Starting PDF re-parsing via parse_pdf_adaptive.py...');
  exec('python parse_pdf_adaptive.py', (error, stdout, stderr) => {
    if (error) {
      logMessage(`PDF parse error: ${error.message}`);
      return res.status(500).json({ error: error.message });
    }
    
    // Reset contacts_status.json
    if (fs.existsSync(STATUS_FILE)) {
      try {
        fs.unlinkSync(STATUS_FILE);
      } catch (e) {
        // ignore
      }
    }
    
    const contacts = getContactsStatus();
    logMessage(`Successfully re-parsed PDF. Loaded ${contacts.length} contacts.`);
    res.json({ success: true, count: contacts.length });
  });
});

// Initialize files if they don't exist
getSettings();
getContactsStatus();

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
