const fs = require('fs');
const path = require('path');

// File paths
const CONTACTS_FILE = path.join(__dirname, 'contacts.json');
const STATUS_FILE = path.join(__dirname, 'contacts_status.json');
const SETTINGS_FILE = path.join(__dirname, 'settings.json');

// Backups folder
const BACKUPS_DIR = path.join(__dirname, 'backups_pdf');
if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR);
}

// 1. Google Sheet GViz API Endpoint URL
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1IsLpjhD7BGSXzjqdkqWu1CD0z1R3ANx-U19y_zqPaE0/gviz/tq?tqx=out:json&gid=34506927';

async function importSheet() {
  console.log('Fetching Google Sheet data...');
  try {
    const res = await fetch(SHEET_URL);
    const text = await res.text();
    
    // Parse Google visualization JSON-RPC response
    const jsonMatch = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*?)\);/);
    if (!jsonMatch) {
      throw new Error('Failed to match google visualization setResponse format.');
    }
    
    const data = JSON.parse(jsonMatch[1]);
    const rows = data.table.rows;
    
    console.log(`Fetched ${rows.length} rows (including header). Processing bottom-to-top...`);
    
    // Map columns: 
    // Col 0: First Name, Col 1: Last Name, Col 2: Name, Col 3: Email, Col 4: Phone, 
    // Col 5: Title, Col 6: Company Name, Col 7: Website, Col 8: Categories, Col 9: Location,
    // Col 10: Target Role, Col 11: Has Email, Col 12: LinkedIn URL, Col 13: LinkedIn Query, Col 14: Source
    const newContacts = [];
    let skippedCount = 0;
    
    // Iterate from bottom to top (skip row 0 header)
    for (let i = rows.length - 1; i >= 1; i--) {
      const cells = rows[i].c;
      if (!cells) continue;
      
      const getVal = (idx) => (cells[idx] && cells[idx].v !== null && cells[idx].v !== undefined) ? String(cells[idx].v).trim() : '';
      
      const firstName = getVal(0);
      const fullName  = getVal(2);
      const email     = getVal(3);
      const title     = getVal(5);
      const company   = getVal(6) || 'your company';
      
      const name = firstName || (fullName ? fullName.split(' ')[0] : 'there');
      
      // Basic email filter validation
      if (!email || !email.includes('@') || !email.includes('.')) {
        skippedCount++;
        continue;
      }
      
      newContacts.push({
        sno: newContacts.length + 1,
        name: name,
        email: email,
        title: title,
        company: company,
        isValidEmail: true,
        page: 1
      });
    }
    
    console.log(`Successfully mapped ${newContacts.length} valid contacts from bottom to top (Skipped ${skippedCount} due to missing/invalid email).`);
    
    // 2. Backup existing contacts files if they exist
    if (fs.existsSync(CONTACTS_FILE)) {
      fs.copyFileSync(CONTACTS_FILE, path.join(BACKUPS_DIR, `contacts_backup_${Date.now()}.json`));
      console.log('Backed up existing contacts.json');
    }
    if (fs.existsSync(STATUS_FILE)) {
      fs.copyFileSync(STATUS_FILE, path.join(BACKUPS_DIR, `contacts_status_backup_${Date.now()}.json`));
      console.log('Backed up existing contacts_status.json');
    }
    
    // 3. Write new contacts.json
    fs.writeFileSync(CONTACTS_FILE, JSON.stringify(newContacts, null, 2), 'utf-8');
    console.log(`Saved new contacts list to contacts.json`);
    
    // 4. Initialize contacts_status.json
    const initialStatus = newContacts.map(c => ({
      ...c,
      status: 'pending',
      sentAt: null,
      error: null
    }));
    fs.writeFileSync(STATUS_FILE, JSON.stringify(initialStatus, null, 2), 'utf-8');
    console.log(`Initialized new progress status tracker to contacts_status.json`);
    
    // 5. Update settings.json with the exact template requested
    if (fs.existsSync(SETTINGS_FILE)) {
      try {
        const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
        
        settings.smtp.user = 'kkakani160@gmail.com';
        settings.smtp.pass = 'mfsi eykr ujim fmae';
        settings.smtp.senderEmail = 'kkakani160@gmail.com';
        settings.template.subject = 'exploring opportunities at {{company_name}}';
        settings.template.body = `Hi {{founder_name}},

Quick one — I'm Keshav, a pre-final year undergrad at IIT Jodhpur. I came across {{company_name}} recently and really liked your approach to building AI-powered products.

Currently I'm a Backend + AI Intern at UnitedTechlab, building backend services, AI workflows, and automation systems. Alongside that, I've been running an agentic AI workflow that analyzes how first-time users experience a startup through its public website. It combines ReAct agents, Hybrid RAG, LangGraph orchestration, production guardrails, and multi-model inference — my recent runs helped startups like KAINest and Vortexify identify key product friction and usability gaps.

Working on reliable AI systems and everything that goes into building them is the kind of engineering I genuinely enjoy, and I'd love to contribute to what your team is building.

I've attached my resume for context. Looking forward to hearing from you.

Best,
Keshav Kakani
B.Tech, IIT Jodhpur`;
        
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
        console.log('Successfully updated settings.json with the new email template.');
      } catch (err) {
        console.error('Error updating settings.json:', err.message);
      }
    }
    
    console.log('Google Sheet import and campaign configuration completed successfully!');
  } catch (error) {
    console.error('Import failed:', error.message);
  }
}

importSheet();
