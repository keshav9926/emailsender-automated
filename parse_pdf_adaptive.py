import pypdf
import json
import re

pdf_path = r"c:\Users\Keshav Kakani\Desktop\PROJECTS\emailsender\CompanyWise HR contact (1) (1).pdf"
reader = pypdf.PdfReader(pdf_path)

contacts = []
failures = []

for page_idx, page in enumerate(reader.pages):
    text = page.extract_text(extraction_mode="layout")
    lines = text.split("\n")
    
    # First, collect candidate lines and identify the ones that split into 5 parts
    page_records = []
    col_positions = {1: [], 2: [], 3: [], 4: []} # store start positions of Name, Email, Title, Company
    
    for line_idx, line in enumerate(lines):
        line_stripped = line.strip()
        if not line_stripped or ("SNo" in line_stripped and "Email" in line_stripped):
            continue
            
        # Split by multiple spaces
        parts = re.split(r'\s{2,}', line_stripped)
        
        # Check if it starts with a serial number
        if parts[0].isdigit():
            sno = int(parts[0])
            page_records.append({
                "line_idx": line_idx,
                "line": line,
                "line_stripped": line_stripped,
                "sno": sno,
                "initial_parts": parts
            })
            
            if len(parts) == 5:
                # Find start positions of each part in the line
                # To prevent matching substrings, search from left to right
                pos = 0
                for col_idx in range(5):
                    part = parts[col_idx]
                    pos = line.find(part, pos)
                    if col_idx > 0:
                        col_positions[col_idx].append(pos)
                    pos += len(part)

    # Determine average column positions for this page
    avg_positions = {}
    for col_idx in range(1, 5):
        if col_positions[col_idx]:
            # Use median to avoid outliers (pure Python implementation)
            sorted_pos = sorted(col_positions[col_idx])
            avg_positions[col_idx] = sorted_pos[len(sorted_pos) // 2]
        else:
            # Fallback to page 1 defaults if no 5-part lines exist (unlikely)
            fallbacks = {1: 14, 2: 51, 3: 105, 4: 167}
            avg_positions[col_idx] = fallbacks[col_idx]

    # Process all records on this page
    for record in page_records:
        parts = record["initial_parts"]
        line = record["line"]
        
        if len(parts) == 5:
            # Clean split
            name, email, title, company = parts[1], parts[2], parts[3], parts[4]
        else:
            # Merged split - use layout indices
            # Define slices based on page average positions
            p1 = avg_positions[1]
            p2 = avg_positions[2]
            p3 = avg_positions[3]
            p4 = avg_positions[4]
            
            sno_str = line[:p1].strip()
            name = line[p1:p2].strip()
            email = line[p2:p3].strip()
            title = line[p3:p4].strip()
            company = line[p4:].strip()
            
            # Print details of the recovery
            # print(f"Recovered Page {page_idx+1}, SNo {record['sno']}: '{name}' | '{email}' | '{title}' | '{company}'")
        
        is_valid_email = "@" in email and "." in email
        
        contacts.append({
            "sno": record["sno"],
            "name": name,
            "email": email,
            "title": title,
            "company": company,
            "isValidEmail": is_valid_email,
            "page": page_idx + 1
        })

print(f"Total contacts extracted with adaptive parser: {len(contacts)}")
# Verify all serial numbers are consecutive and unique
snos = [c["sno"] for c in contacts]
print(f"Unique SNo count: {len(set(snos))}")
print(f"Min SNo: {min(snos)}, Max SNo: {max(snos)}")

# Save to contacts.json
output_json_path = r"c:\Users\Keshav Kakani\Desktop\PROJECTS\emailsender\contacts.json"
with open(output_json_path, "w", encoding="utf-8") as f:
    json.dump(contacts, f, indent=2)
print("Updated contacts.json")
