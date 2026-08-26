const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const https = require('https');
const net = require('net');

const dnsPromises = require('dns').promises;
try { require('dns').setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']); } catch(e) {}

async function verifyDomainMX(domain) {
  if (!domain) return false;
  try {
    const records = await dnsPromises.resolveMx(domain);
    return Array.isArray(records) && records.length > 0;
  } catch (err) {
    return false;
  }
}

async function isCatchAllDomain(domain, mxHost) {
  return new Promise((resolve) => {
    let done = false;
    const fakeEmail = `nonexistent_chk_9988@${domain}`;
    let socket;
    const finish = (isCA) => {
      if (done) return;
      done = true;
      if (socket) { try { socket.destroy(); } catch (e) {} }
      resolve(isCA);
    };
    const timer = setTimeout(() => finish(false), 3000);
    try {
      socket = net.createConnection(25, mxHost);
      socket.setTimeout(2500);
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
          if (step === 0 && code === 220) { step = 1; send('EHLO verify.iitj.ac.in'); }
          else if (step === 1 && (code === 250 || code === 220)) { if (!line.includes('-')) { step = 2; send('MAIL FROM:<verify@iitj.ac.in>'); } }
          else if (step === 2 && code === 250) { step = 3; send(`RCPT TO:<${fakeEmail}>`); }
          else if (step === 3) {
            clearTimeout(timer); send('QUIT');
            finish(code === 250 || code === 251);
          }
        }
      });
    } catch (e) { clearTimeout(timer); finish(false); }
  });
}

async function verifyMailboxSMTP(email, emailType = '') {
  if (!email || !email.includes('@')) return { status: 'invalid', reason: 'Invalid email syntax' };
  const domain = email.split('@')[1];
  let mxHost;
  try {
    const records = await dnsPromises.resolveMx(domain);
    if (!records || records.length === 0) return { status: 'invalid', reason: `No MX records for domain ${domain}` };
    records.sort((a, b) => a.priority - b.priority);
    mxHost = records[0].exchange;
  } catch (err) {
    return { status: 'invalid', reason: `MX resolution failed for domain ${domain}` };
  }

  const isCA = await isCatchAllDomain(domain, mxHost);
  if (isCA && (emailType.includes('likely') || emailType.includes('first@'))) {
    return { status: 'invalid', reason: `Skipped: Guessed handle on Catch-All domain (${domain})` };
  }

  return new Promise((resolve) => {
    let done = false;
    const socket = net.createConnection(25, mxHost);
    socket.setTimeout(6000);

    let step = 0, buffer = '';
    const send = (cmd) => socket.write(cmd + '\r\n');

    const finish = (res, reason) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve({ status: res, reason });
    };

    socket.on('error', (e) => finish('unverifiable', e.message));
    socket.on('timeout', () => finish('unverifiable', 'SMTP handshake timeout'));

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
          step = 3; send('RCPT TO:<' + email + '>');
        } else if (step === 3) {
          send('QUIT');
          if (code === 250 || code === 251) {
            finish('valid', 'Mailbox confirmed');
          } else if (code >= 550 && code <= 554) {
            finish('invalid', `Mailbox does not exist (SMTP response: ${line})`);
          } else {
            finish('unverifiable', `SMTP code ${code}`);
          }
        } else if (code >= 500 && step < 3) {
          finish('unverifiable', `SMTP error code ${code}`);
        }
      }
    });
  });
}

const CONTACTS_STATUS_FILE = path.join(__dirname, 'contacts_status.json');
const SETTINGS_FILE = path.join(__dirname, 'settings.json');
const LOGS_FILE = path.join(__dirname, 'sending_logs.txt');
const RESUME_FILE = path.join(__dirname, 'resume (20).pdf');
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

function compileTemplate(text, contact, templateIndex = 0) {
  if (!text) return '';
  const name      = (contact.name && contact.name.trim()) ? contact.name.trim() : 'there';
  const company   = (contact.company && contact.company.trim()) ? contact.company.trim() : 'your company';
  const title     = (contact.title && contact.title.trim()) ? contact.title.trim() : '';
  const email     = (contact.email && contact.email.trim()) ? contact.email.trim() : '';
  const vortexify = 'https://firstimpressione.netlify.app/vortexify/';
  const kainest   = 'https://firstimpressione.netlify.app/kainest/';
  const github    = 'https://github.com/keshav9926';
  const portfolio = 'https://keshav9926.github.io';

  const defaultSubjects = [
    `Engineering @ ${company} + IITJ AI/Backend engineer`,
    `Pre-final year IIT Jodhpur engineer interested in ${company}`,
    `Building AI & backend systems // IIT Jodhpur -> ${company}`
  ];

  const defaultHooks = [
    `Came across ${company}'s product—really impressed by what you and the team are building.`,
    `Been tracking ${company}'s growth and engineering work recently—super interesting space.`,
    `Saw what ${company} is building and wanted to reach out directly to the team.`
  ];

  const pSubject  = contact.personalized_subject || defaultSubjects[templateIndex % defaultSubjects.length];
  const pHook     = contact.personalized_hook || defaultHooks[templateIndex % defaultHooks.length];

  return text
    .replace(/\{\{\s*personalized_subject\s*\}\}/gi, pSubject)
    .replace(/\{\{\s*personalized_hook\s*\}\}/gi, pHook)
    .replace(/\{\{\s*founder_name\s*\}\}/gi, name)
    .replace(/\{\{\s*company_name\s*\}\}/gi, company)
    .replace(/\{\{\s*vortexify_report\s*\}\}/gi, vortexify)
    .replace(/\{\{\s*kainest_report\s*\}\}/gi, kainest)
    .replace(/\{\{\s*github_url\s*\}\}/gi, github)
    .replace(/\{\{\s*portfolio_url\s*\}\}/gi, portfolio)
    .replace(/{personalized_subject}/gi, pSubject)
    .replace(/{personalized_hook}/gi, pHook)
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

// ── Indian & Asian Founder Classification + Exclusion Helpers ─────────────────
const commonWesternFirstNames = new Set([
  'adam', 'alex', 'alexander', 'andrew', 'anthony', 'arthur', 'austin', 'ben', 'benjamin', 'brandon',
  'brian', 'caitlin', 'cameron', 'carolyn', 'charles', 'christian', 'christopher', 'cody', 'colin', 'connor', 'curtis',
  'daniel', 'dan', 'david', 'derrick', 'derek', 'dirkjan', 'dylan', 'edward', 'eric', 'ethan', 'evan',
  'frank', 'gabriel', 'george', 'graham', 'grayson', 'gregory', 'harrison', 'henry', 'hugo', 'ian',
  'isaac', 'jack', 'jacob', 'james', 'jason', 'jesse', 'jeff', 'jeffrey', 'jeremy', 'john',
  'jonathan', 'jordan', 'joseph', 'josh', 'joshua', 'julian', 'justin', 'kurt', 'kyle', 'lance',
  'lawrence', 'leo', 'leonard', 'logan', 'lucas', 'luke', 'marcus', 'mark', 'martin', 'marvin',
  'mason', 'matthew', 'max', 'michael', 'morgan', 'nathan', 'nicholas', 'nick', 'nolan', 'owen',
  'patrick', 'paul', 'peter', 'philip', 'richard', 'robert', 'ryan', 'sam', 'samuel', 'sean',
  'scott', 'shaun', 'shawn', 'stephen', 'steven', 'thomas', 'timothy', 'timmy', 'tristan', 'tyler',
  'victor', 'vincent', 'wesley', 'william', 'zachary'
]);

const indianAsianFirstNames = new Set([
  'aarti', 'abhinav', 'abhishek', 'adhityaa', 'aditi', 'aditya', 'agam', 'ahmed', 'ahsan', 'ajay',
  'akash', 'akhil', 'akshat', 'akshay', 'ali', 'aman', 'amar', 'ammar', 'amit', 'amol', 'ananya',
  'aniket', 'anik', 'ankit', 'ankita', 'ankur', 'anmol', 'anshul', 'anurag', 'anusha', 'aparna',
  'apoorv', 'archana', 'archit', 'arjit', 'arjun', 'arsalan', 'arpit', 'arun', 'arvind', 'asad',
  'ashish', 'ashok', 'ashutosh', 'ashwin', 'atish', 'atul', 'avantika', 'ayantika', 'avinash', 'ayush',
  'ayodeji', 'ayomide', 'azhar', 'barkha', 'bharat', 'bhaskar', 'bhavesh', 'bhavin', 'bhuvan', 'brijesh',
  'chaitanya', 'chandan', 'chetan', 'chirag', 'daksh', 'deep', 'deepa', 'deepak', 'deepika', 'dev',
  'devendra', 'dhairya', 'dhaval', 'dhruv', 'dinesh', 'divya', 'divyansh', 'divyanshu', 'ekta', 'gaurav',
  'gautam', 'gayatri', 'gopika', 'gunwoo', 'hamza', 'hardik', 'hari', 'harish', 'harsh', 'harshil',
  'harshit', 'hasan', 'hemant', 'hemanth', 'hisham', 'hitesh', 'imran', 'ishan', 'ishaan', 'isha',
  'ishita', 'jagdish', 'jaideep', 'jawad', 'jay', 'jayant', 'jitendra', 'jyoti', 'kabir', 'kailash',
  'kajal', 'kamal', 'karan', 'karthik', 'kartik', 'kartikey', 'kaushik', 'kavita', 'kedar', 'keshav',
  'khalid', 'komal', 'kranti', 'krish', 'krishna', 'kshitij', 'kuldeep', 'kumaar', 'kumar', 'kunaal',
  'kunal', 'lakshay', 'lalit', 'madhav', 'manan', 'manish', 'manoj', 'mayank', 'megha', 'mihir',
  'mohammad', 'mohammed', 'mohit', 'monu', 'mukesh', 'mukul', 'mustafa', 'naman', 'nabil', 'naresh', 'naveen',
  'navin', 'navneet', 'neeraj', 'neha', 'nidhi', 'nikhil', 'nilesh', 'nipun', 'niraj', 'nisha',
  'nishant', 'nitin', 'nitish', 'nivas', 'om', 'omkar', 'pankaj', 'pantha', 'parag', 'paras',
  'parth', 'pavan', 'pawan', 'piyush', 'pooja', 'poonam', 'prachi', 'pragya', 'prakash', 'prama',
  'pramod', 'pranav', 'pranay', 'prashant', 'prateek', 'pratik', 'praveen', 'pravin', 'prem', 'pritam',
  'priya', 'priyanka', 'priyansh', 'puneet', 'pushkar', 'raghav', 'rahul', 'raj', 'raja', 'rajan',
  'rajat', 'rajeev', 'rajesh', 'rajiv', 'rakesh', 'ram', 'ramesh', 'rami', 'rangan', 'ranjeet',
  'rashid', 'ravi', 'ravindra', 'rishabh', 'rishi', 'ritesh', 'ritu', 'ritvik', 'rohan', 'rohit',
  'romil', 'ronak', 'ronit', 'roshan', 'roshni', 'ruchir', 'rudra', 'rupesh', 'sachin', 'saumik', 'sagar',
  'sahil', 'sakshi', 'samai', 'sameer', 'samir', 'sandeep', 'sanjay', 'sanjeev', 'sanjit', 'sanket',
  'sanya', 'santam', 'sarthak', 'satish', 'satyam', 'saurabh', 'saurav', 'seema', 'selina', 'shailesh',
  'shakti', 'shankara', 'shantam', 'sharad', 'shashank', 'shekhar', 'shikhar', 'shivam', 'shivani', 'shree',
  'shreya', 'shreyas', 'shruti', 'shubham', 'siddhant', 'siddharth', 'siddhesh', 'sneha', 'somesh', 'sparsh',
  'sriram', 'srinivas', 'subhash', 'sudhir', 'sujay', 'sumeet', 'sumit', 'sunil', 'suraj', 'suresh',
  'surya', 'swapnil', 'swati', 'tanmay', 'tanuj', 'tanvi', 'tapan', 'tarun', 'trisha', 'tushar',
  'udai', 'umang', 'upasana', 'utkarsh', 'vaibhav', 'vandana', 'varun', 'vashisht', 'vedant', 'venkat',
  'venkatesh', 'vibhor', 'vidhi', 'vignesh', 'vijay', 'vikas', 'vikram', 'vinay', 'vineet', 'vinod',
  'vipul', 'vishal', 'vishnu', 'vishwanath', 'vivek', 'yamini', 'yash', 'yasharth', 'yashwant', 'yazin',
  'yogesh', 'zaid', 'zayn',
  'amal', 'bo', 'chao', 'chen', 'cheng', 'daisuke', 'dong', 'fang', 'feng', 'ghita', 'goh', 'han', 'hao',
  'haotian', 'hieu', 'hiro', 'ho', 'hong', 'hsu', 'huang', 'huynh', 'hyeon', 'hyuk', 'jae', 'jang',
  'jie', 'jin', 'jing', 'jun', 'jung', 'kai', 'katsunori', 'kazuki', 'kenta', 'kim', 'ko', 'kwek',
  'kyung', 'lai', 'lau', 'lei', 'li', 'liang', 'liew', 'lim', 'lin', 'ling', 'liu', 'long',
  'lu', 'luo', 'min', 'ming', 'minh', 'naoki', 'ng', 'ngo', 'nguyen', 'ong', 'park', 'peng', 'pham',
  'quan', 'ren', 'rui', 'ruo', 'ryo', 'ryota', 'santo', 'satoshi', 'seung', 'shin', 'sho',
  'shota', 'song', 'su', 'sun', 'tai', 'takeo', 'takeshi', 'takuya', 'tan', 'tanaka', 'tao', 'taro',
  'tatsuo', 'tay', 'teng', 'teo', 'tian', 'ting', 'toan', 'tran', 'trinh', 'tsai', 'tseng', 'tu',
  'tuan', 'viet', 'vo', 'vu', 'wang', 'wataru', 'wei', 'wong', 'woo', 'wu', 'xiao', 'xie', 'xin',
  'xu', 'xuan', 'yanchuan', 'yamada', 'yamamoto', 'yang', 'yasu', 'ye', 'yee', 'yeo', 'yi', 'ying',
  'yujin', 'yuki', 'yuma', 'yun', 'yuta', 'yuting', 'zhang', 'zhao', 'zheng', 'zhen', 'zhou', 'zhu', 'zi'
]);

const asianSurnamesList = [
  'sharma', 'gupta', 'singh', 'patel', 'kumar', 'shah', 'rao', 'reddy', 'nair', 'mehta', 'verma',
  'joshi', 'agarwal', 'jain', 'khan', 'ali', 'roy', 'das', 'sen', 'paul', 'bhatt', 'kulkarni',
  'iyer', 'iyengar', 'menon', 'pillai', 'chatterjee', 'mukherjee', 'banerjee', 'ghosh', 'bose',
  'dutta', 'modi', 'chawla', 'malhotra', 'kapoor', 'khanna', 'sethi', 'chopra', 'sood', 'arora',
  'gill', 'dhillon', 'sidhu', 'sandhu', 'kaur', 'bedi', 'kohli', 'batra', 'suri', 'talwar', 'tandon',
  'saxena', 'srivastava', 'mathur', 'bhatnagar', 'rastogi', 'tripathi', 'pandey', 'shukla', 'mishra',
  'dubey', 'tiwari', 'pathak', 'gautam', 'kashyap', 'kakani', 'agrawal', 'bansal', 'mittal', 'goel',
  'garg', 'mahajan', 'dewan', 'taneja', 'wadhwa', 'goyal', 'bhasin', 'khetarpal', 'somani', 'singhal',
  'basu', 'saboo', 'chu', 'menon',
  'nguyen', 'tran', 'pham', 'huynh', 'hoang', 'duong', 'truong', 'zhang', 'chen', 'wang', 'yang',
  'liu', 'huang', 'zhou', 'wu', 'lin', 'zheng', 'liang', 'chang', 'chiang', 'hsieh', 'tsai',
  'jeong', 'seung', 'kyeong', 'hyeon', 'tanaka', 'suzuki', 'takahashi', 'watanabe', 'yamamoto'
];

const asianSurnameRegexes = asianSurnamesList.map(s => new RegExp(`\\b${s}\\b`, 'i'));

function isAsianOrIndianFounder(contact) {
  if (!contact) return false;
  const fullName = (contact.name || '').trim().toLowerCase();
  const email = (contact.email || '').trim().toLowerCase();
  if (!fullName) return false;
  
  const nameParts = fullName.split(/\s+/);
  const firstName = nameParts[0];
  const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';

  if (commonWesternFirstNames.has(firstName)) {
    let hasAsianIndicator = false;
    for (const regex of asianSurnameRegexes) {
      if (regex.test(fullName) || regex.test(email)) {
        hasAsianIndicator = true;
        break;
      }
    }
    if (email.endsWith('.in') || email.includes('co.in')) hasAsianIndicator = true;
    return hasAsianIndicator;
  }

  if (indianAsianFirstNames.has(firstName) || indianAsianFirstNames.has(lastName)) return true;
  for (const regex of asianSurnameRegexes) {
    if (regex.test(fullName) || regex.test(email)) return true;
  }

  if (/^(abh|ad|ak|am|an|ap|ar|ash|ay|bh|ch|da|de|dh|di|ga|ha|he|hi|is|ja|ka|ke|kr|ku|ma|may|mo|na|ne|ni|om|pa|pr|ra|ri|ro|ru|sa|sh|sid|su|ta|va|ve|vi|ya)/i.test(firstName)) {
    if (/(av|an|al|ik|it|esh|ish|raj|uj|un|deep|meet|kar|ur|am|ath|ay|eev|ant|endra|ansh|arth|il|in|ak|ik|esh|ay|al|ia|ya)$/i.test(firstName)) {
      return true;
    }
  }

  if (email.endsWith('.in') || email.includes('co.in')) return true;
  return false;
}

function isExcludedContact(contact) {
  if (!contact) return false;
  const comp = (contact.company || '').toLowerCase();
  const name = (contact.name || '').toLowerCase();
  const email = (contact.email || '').toLowerCase();

  // Exclude Vortexify and Narrative / Aditya Tewari and Suchit
  if (comp.includes('vortexify') || comp.includes('narrative')) return true;
  if (email.includes('trynarrative.com') || email.includes('praxis-tech.ai') || email.includes('atewari')) return true;
  if (name.includes('suchit') || name.includes('sucheta') || (name.includes('aditya') && comp.includes('vortexify'))) return true;

  return false;
}

function getLocalDateStr(dateInput = new Date()) {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const istDate = new Date(d.getTime() + (5.5 * 60 * 60 * 1000));
  return istDate.toISOString().slice(0, 10);
}

async function runAutomation() {
  logMessage('🚀 Starting Automated Founder Outreach Campaign from b24bb1015@iitj.ac.in...');

  while (true) {
    const settings = getSettings();
    const contacts = getContacts();

    // Check daily cap (IST Local Day)
    const maxPerDay = settings.maxPerDay || 35;
    const todayStr = getLocalDateStr(new Date());
    const sentToday = contacts.filter(
      c => c.status === 'sent' && c.sentAt && getLocalDateStr(c.sentAt) === todayStr
    ).length;

    if (sentToday >= maxPerDay) {
      logMessage(`⏸ Daily send cap reached (${sentToday}/${maxPerDay} sent today on ${todayStr}). Pausing automation.`);
      break;
    }

    // Build contacted companies set for 1-contact-per-company rule
    const contactedCompanies = new Set(
      contacts
        .filter(c => c.status === 'sent' || c.status === 'sending')
        .map(c => (c.company || '').trim().toLowerCase())
        .filter(Boolean)
    );

    let nextIdx = -1;
    let modified = false;

    // First: Filter out explicitly excluded contacts (Vortexify, Narrative, etc.)
    for (let i = 0; i < contacts.length; i++) {
      if (contacts[i].status === 'pending' && isExcludedContact(contacts[i])) {
        contacts[i].status = 'skipped';
        contacts[i].error = `Excluded: User is already talking with founder (${contacts[i].company})`;
        modified = true;
        logMessage(`🚫 EXCLUDED [#${contacts[i].sno}]: ${contacts[i].name} at ${contacts[i].company} — User in active conversation.`);
      }
    }

    // Step A: Look for pending Indian / Asian founders whose company has NOT been contacted yet
    for (let i = 0; i < contacts.length; i++) {
      if (contacts[i].status !== 'pending') continue;
      if (!isAsianOrIndianFounder(contacts[i])) continue;

      const comp = (contacts[i].company || '').trim().toLowerCase();
      if (comp && contactedCompanies.has(comp)) {
        contacts[i].status = 'skipped';
        contacts[i].error = `Skipped: Company "${contacts[i].company}" already contacted`;
        modified = true;
        logMessage(`⏭ SKIPPED [#${contacts[i].sno}]: ${contacts[i].name} (${contacts[i].company}) — Company already contacted.`);
      } else {
        nextIdx = i;
        break;
      }
    }

    if (modified) {
      saveContacts(contacts);
    }

    // Stop if no pending Indian/Asian founders remain
    if (nextIdx === -1) {
      logMessage('🎉 All pending Indian/Asian founders have been processed! Campaign complete.');
      break;
    }

    const contact = contacts[nextIdx];
    contact.status = 'sending';
    saveContacts(contacts);

    logMessage(`📧 [#${contact.sno}] Sending email to ${contact.name} (${contact.email}) at ${contact.company}...`);

    // ── Pre-flight MX Record Validation ──────────────────────────────────────
    const emailDomain = contact.email ? contact.email.split('@')[1] : null;
    if (!emailDomain || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) {
      contact.status = 'failed';
      contact.error = 'Invalid email syntax';
      saveContacts(contacts);
      logMessage(`⚠️ SKIPPED: ${contact.email} has invalid format.`);
      continue;
    }

    const hasMx = await verifyDomainMX(emailDomain);
    if (!hasMx) {
      contact.status = 'failed';
      contact.error = `No MX records found for domain ${emailDomain}`;
      saveContacts(contacts);
      logMessage(`⚠️ SKIPPED: ${contact.email} — Domain "${emailDomain}" has no active mail servers.`);
      continue;
    }

    // ── Pre-flight SMTP Mailbox Existence Verification ───────────────────────
    logMessage(`🔍 Pre-flight SMTP verification for ${contact.email}...`);
    const smtpCheck = await verifyMailboxSMTP(contact.email, contact.email_type || '');
    if (smtpCheck.status === 'invalid') {
      contact.status = 'failed';
      contact.error = smtpCheck.reason;
      saveContacts(contacts);
      logMessage(`⚠️ SKIPPED [Non-Existent Mailbox]: ${contact.email} — ${smtpCheck.reason}`);
      continue;
    }
    logMessage(`✅ Mailbox verified live: ${contact.email} (${smtpCheck.reason})`);

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
      const tplIdx = totalSent % templates.length;
      const tpl = templates[tplIdx];
      logMessage(`📝 Using Template ${tplIdx + 1} of ${templates.length}: "${tpl.subject.substring(0, 40)}..."`);

      const subject = compileTemplate(tpl.subject, contact, tplIdx);
      const textBody = compileTemplate(tpl.body, contact, tplIdx);

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
