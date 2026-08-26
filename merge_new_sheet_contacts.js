const fs = require('fs');
const path = require('path');

const CONTACTS_FILE = path.join(__dirname, 'contacts_status.json');

const newContacts = [
  {
    name: 'Aryan Sharma',
    company: 'Induced',
    email: 'aryan@induced.ai',
    personalized_subject: 'Building browser agents @ Induced + IITJ AI engineer',
    personalized_hook: "I've been following Induced's work in browser automation and autonomous AI agents—really impressed with how you guys are handling stateful web workflows and browser-level execution."
  },
  {
    name: 'Rohit Singh',
    company: 'Xccelera',
    email: 'rohit@xccelera.ai',
    personalized_subject: 'AI Agents & Infra @ Xccelera + IITJ AI engineer',
    personalized_hook: "Came across Xccelera's approach to enterprise AI agents—loved how you're tackling execution workflows and agent orchestration."
  },
  {
    name: 'Rakesh Rajendran',
    company: 'Nudgebee',
    email: 'rakesh@nudgebee.ai',
    personalized_subject: 'AI Nudge Systems @ Nudgebee + IITJ AI engineer',
    personalized_hook: "Really liked Nudgebee's product focus on AI-driven nudge workflows and personalized engagement mechanisms."
  },
  {
    name: 'Manish Choudhary',
    company: 'Flexprice',
    email: 'manish@flexprice.ai',
    personalized_subject: 'Fintech Billing & Pricing AI @ Flexprice + IITJ AI engineer',
    personalized_hook: "Saw Flexprice's platform for usage-based pricing and billing infrastructure—super neat approach to developer fintech infra."
  },
  {
    name: 'Arun Singh',
    company: 'Kris@Work',
    email: 'arun@kriswork.com',
    personalized_subject: 'AI Workplace Copilots @ Kris@Work + IITJ AI engineer',
    personalized_hook: "Impressed by Kris@Work's vision for AI workplace copilots and enterprise context integration."
  },
  {
    name: 'Jaibir Nihal Singh',
    company: 'TraqCheck',
    email: 'jaibir@traqcheck.com',
    personalized_subject: 'AI Background Check Automation @ TraqCheck + IITJ AI engineer',
    personalized_hook: "Really liked how TraqCheck is automating background verification workflows with AI."
  },
  {
    name: 'Anurag Singh',
    company: 'Kily',
    email: 'anurag@kily.ai',
    personalized_subject: 'Building AI Assistants @ Kily + IITJ AI engineer',
    personalized_hook: "Saw what you're building at Kily—great focus on intelligent assistant workflows and user interactions."
  },
  {
    name: 'Arani Chaudhuri',
    company: 'AI Library',
    email: 'arani@ailibrary.ai',
    personalized_subject: 'AI Model Infrastructure @ AI Library + IITJ AI engineer',
    personalized_hook: "Loved AI Library's curation and infrastructure for foundational AI models and developer components."
  },
  {
    name: 'Amritanshu Jain',
    company: 'Simplismart',
    email: 'amritanshu@simplismart.ai',
    personalized_subject: 'High-throughput AI Inference @ Simplismart + IITJ AI engineer',
    personalized_hook: "Been following Simplismart's progress in fast model inference and low-latency AI deployment stacks."
  },
  {
    name: 'Aniket Bajpai',
    company: 'LimeChat',
    email: 'aniket@limechat.ai',
    personalized_subject: 'Conversational Commerce AI @ LimeChat + IITJ AI engineer',
    personalized_hook: "Awesome work with LimeChat's AI-driven conversational commerce platform for modern brands."
  },
  {
    name: 'Harsha Kadimisetty',
    company: 'Aerchain',
    email: 'harsha@aerchain.ai',
    personalized_subject: 'Autonomous Procurement AI @ Aerchain + IITJ AI engineer',
    personalized_hook: "Really impressed by Aerchain's AI-led approach to enterprise procurement and supply chain automation."
  },
  {
    name: 'Prashant Kumar',
    company: 'Coreworks',
    email: 'prashant@coreworks.ai',
    personalized_subject: 'AI System Engineering @ Coreworks + IITJ AI engineer',
    personalized_hook: "Came across Coreworks' AI engineering solutions—great work on specialized model architectures."
  },
  {
    name: 'Ramesh Ravishankar',
    company: 'Highperformr.ai',
    email: 'ramesh@highperformr.ai',
    personalized_subject: 'AI Social & Distribution @ Highperformr.ai + IITJ AI engineer',
    personalized_hook: "Loved Highperformr's AI platform for organic distribution and social growth automation."
  },
  {
    name: 'Rohit Agarwal',
    company: 'Portkey',
    email: 'rohit@portkey.ai',
    personalized_subject: 'LLM Observability & Gateway @ Portkey + IITJ AI engineer',
    personalized_hook: "Big fan of Portkey's LLM gateway, caching, and observability stack—essential infrastructure for AI teams."
  },
  {
    name: 'Surojit Chatterjee',
    company: 'Ema',
    email: 'surojit@ema.ai',
    personalized_subject: 'Universal Enterprise AI Employees @ Ema + IITJ AI engineer',
    personalized_hook: "Following Ema's vision for universal enterprise AI personas—fascinating approach to multi-agent execution."
  },
  {
    name: 'Ashwin Puri',
    company: 'Graas',
    email: 'ashwin@graas.ai',
    personalized_subject: 'Growth AI & Ecommerce Engine @ Graas + IITJ AI engineer',
    personalized_hook: "Impressed by Graas' AI-driven ecommerce growth engine and predictive analytics pipeline."
  },
  {
    name: 'Aniket Behera',
    company: '100ms',
    email: 'aniket@100ms.ai',
    personalized_subject: 'Real-time Audio/Video AI @ 100ms + IITJ AI engineer',
    personalized_hook: "Big admirer of 100ms' infrastructure for real-time video/audio SDKs and AI stream processing."
  },
  {
    name: 'Deepti Prasad',
    company: 'Spyne',
    email: 'deepti@spyne.ai',
    personalized_subject: 'Computer Vision AI @ Spyne + IITJ AI engineer',
    personalized_hook: "Saw Spyne's automated visual cataloging and computer vision pipeline—super innovative application."
  },
  {
    name: 'Sayanta Ghosh',
    company: 'Nurturev',
    email: 'sayanta@nurturev.com',
    personalized_subject: 'Revenue Intelligence AI @ Nurturev + IITJ AI engineer',
    personalized_hook: "Really liked Nurturev's predictive revenue intelligence and buyer intent modeling."
  },
  {
    name: 'Varun Vummadi',
    company: 'GigaML',
    email: 'varun@gigaml.ai',
    personalized_subject: 'On-Prem LLMs & Fine-Tuning @ GigaML + IITJ AI engineer',
    personalized_hook: "Following GigaML's work in enterprise model fine-tuning and secure local LLM deployments."
  },
  {
    name: 'Gaurav Toshniwal',
    company: 'Sherlocks AI',
    email: 'gaurav@sherlocksai.com',
    personalized_subject: 'AI Security & Detection @ Sherlocks AI + IITJ AI engineer',
    personalized_hook: "Saw Sherlocks AI's threat detection and intelligence platform—great work on AI-first security."
  },
  {
    name: 'Shoaib Khan',
    company: 'OSlash',
    email: 'shoaib@oslash.com',
    personalized_subject: 'Knowledge Search & Shortcuts @ OSlash + IITJ AI engineer',
    personalized_hook: "Long-time fan of OSlash's enterprise shortcuts and knowledge discovery workspace."
  }
];

const contacts = JSON.parse(fs.readFileSync(CONTACTS_FILE, 'utf-8'));
const existingEmails = new Set(contacts.map(c => c.email.toLowerCase()));
let maxSno = Math.max(...contacts.map(c => c.sno || 0));

let addedCount = 0;
for (const item of newContacts) {
  if (!existingEmails.has(item.email.toLowerCase())) {
    maxSno++;
    contacts.push({
      sno: maxSno,
      name: item.name,
      company: item.company,
      email: item.email,
      title: 'Founder / CEO',
      personalized_subject: item.personalized_subject,
      personalized_hook: item.personalized_hook,
      status: 'pending'
    });
    addedCount++;
  }
}

fs.writeFileSync(CONTACTS_FILE, JSON.stringify(contacts, null, 2), 'utf-8');
console.log(`✅ Merged ${addedCount} new contacts from spreadsheet into contacts_status.json! Total contacts now: ${contacts.length}`);
