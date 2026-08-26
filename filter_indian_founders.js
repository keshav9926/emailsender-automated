const fs = require('fs');
const path = require('path');

const STATUS_FILE = path.join(__dirname, 'contacts_status.json');
const CSV_FILE = path.join(__dirname, 'indian_founders.csv');
const JSON_FILE = path.join(__dirname, 'indian_founders.json');

const contacts = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf-8'));

// Common Western / Non-Asian First Names to explicitly exclude UNLESS email or surname has an Asian indicator
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

// Verified Indian & Asian First Names (South Asian, East Asian, SE Asian)
const indianAsianFirstNames = new Set([
  // South Asian (Indian / Pakistani / Bangladeshi / Sri Lankan / Nepali)
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

  // East Asian / SE Asian
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

// Clear Indian / Asian Surnames & Handles (Word boundary regex matched)
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

  // 1. If first name is explicitly a common Western name, MUST have a distinct Asian surname or domain indicator
  if (commonWesternFirstNames.has(firstName)) {
    let hasAsianIndicator = false;
    for (const regex of asianSurnameRegexes) {
      if (regex.test(fullName) || regex.test(email)) {
        hasAsianIndicator = true;
        break;
      }
    }
    if (email.endsWith('.in') || email.includes('co.in')) {
      hasAsianIndicator = true;
    }
    return hasAsianIndicator; // Strict exit for Western names!
  }

  // 2. Direct match in Indian/Asian dictionary for first name or last name
  if (indianAsianFirstNames.has(firstName) || indianAsianFirstNames.has(lastName)) return true;

  // 3. Check full name or email for Asian surnames (with word boundary)
  for (const regex of asianSurnameRegexes) {
    if (regex.test(fullName) || regex.test(email)) return true;
  }

  // 4. Indian prefix + suffix heuristic for first names
  if (/^(abh|ad|ak|am|an|ap|ar|ash|ay|bh|ch|da|de|dh|di|ga|ha|he|hi|is|ja|ka|ke|kr|ku|ma|may|mo|na|ne|ni|om|pa|pr|ra|ri|ro|ru|sa|sh|sid|su|ta|va|ve|vi|ya)/i.test(firstName)) {
    if (/(av|an|al|ik|it|esh|ish|raj|uj|un|deep|meet|kar|ur|am|ath|ay|eev|ant|endra|ansh|arth|il|in|ak|ik|esh|ay|al|ia|ya)$/i.test(firstName)) {
      return true;
    }
  }

  // 5. Check domain (.in, .co.in)
  if (email.endsWith('.in') || email.includes('co.in')) return true;

  return false;
}

const asianFounders = contacts.filter(isAsianOrIndianFounder);

// Write JSON
fs.writeFileSync(JSON_FILE, JSON.stringify(asianFounders, null, 2), 'utf-8');

// Write CSV
const csvRows = [];
csvRows.push(['SNo', 'Name', 'Title', 'Company', 'Email', 'Status', 'SentAt', 'Error'].map(v => `"${v}"`).join(','));

asianFounders.forEach(c => {
  csvRows.push([
    c.sno || '',
    (c.name || '').replace(/"/g, '""'),
    (c.title || '').replace(/"/g, '""'),
    (c.company || '').replace(/"/g, '""'),
    (c.email || '').replace(/"/g, '""'),
    c.status || 'pending',
    c.sentAt || '',
    (c.error || '').replace(/"/g, '""')
  ].map(v => `"${v}"`).join(','));
});

fs.writeFileSync(CSV_FILE, csvRows.join('\n'), 'utf-8');

console.log(`\n=== STRICT Asian/Indian Founders Scan Complete ===`);
console.log(`Filtered ${asianFounders.length} verified Indian & Asian founders out of ${contacts.length} total contacts.`);
console.log(`Created ${CSV_FILE}`);
console.log(`Created ${JSON_FILE}`);

const stats = {};
asianFounders.forEach(c => {
  stats[c.status] = (stats[c.status] || 0) + 1;
});
console.log('\nStatus Breakdown:', stats);
