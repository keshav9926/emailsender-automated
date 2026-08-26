import json
from datetime import datetime, timezone, timedelta

with open('contacts_status.json', 'r', encoding='utf-8') as f:
    contacts = json.load(f)

ist = timezone(timedelta(hours=5, minutes=30))
today_str = datetime.now(ist).strftime('%Y-%m-%d')

def to_ist_date(sent_at_str):
    if not sent_at_str:
        return ''
    try:
        if 'T' in sent_at_str:
            d = datetime.fromisoformat(sent_at_str.replace('Z', '+00:00'))
        else:
            d = datetime.strptime(sent_at_str, '%Y-%m-%d %H:%M:%S').replace(tzinfo=timezone(timedelta(hours=5, minutes=30)))
        return d.astimezone(ist).strftime('%Y-%m-%d')
    except Exception:
        return sent_at_str[:10]

sent_today = [c for c in contacts if c.get('status') == 'sent' and to_ist_date(c.get('sentAt')) == today_str]
print(f"Today is {today_str}. Sent today count: {len(sent_today)}")

pending_contacts = [c for c in contacts if c.get('status') == 'pending']
print(f"Total pending contacts: {len(pending_contacts)}")
print("First 5 pending contacts:")
for c in pending_contacts[:5]:
    print(f"  [#{c['sno']}] {c['name']} ({c['email']}) at {c['company']}")
