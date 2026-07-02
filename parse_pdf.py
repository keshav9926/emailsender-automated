import pypdf
import json
import re

pdf_path = r"c:\Users\Keshav Kakani\Desktop\PROJECTS\emailsender\CompanyWise HR contact (1) (1).pdf"
reader = pypdf.PdfReader(pdf_path)

contacts = []
unparsed_lines = []

for page_idx, page in enumerate(reader.pages):
    text = page.extract_text(extraction_mode="layout")
    lines = text.split("\n")
    
    # Find the header line on this page
    header_line = None
    idx_sno = idx_name = idx_email = idx_title = idx_company = -1
    
    for idx, line in enumerate(lines):
        if "SNo" in line and "Email" in line and "Company" in line:
            header_line = line
            idx_sno = line.find("SNo")
            idx_name = line.find("Name")
            idx_email = line.find("Email")
            idx_title = line.find("Title")
            idx_company = line.find("Company")
            break
            
    if header_line is None:
        # If no header is found on this page, print a warning
        print(f"Warning: No header found on page {page_idx + 1}")
        # We can fallback to the indices from the previous page if they exist
        if idx_sno == -1:
            # Defaults based on page 1 standard offsets
            idx_sno = 1
            idx_name = 14
            idx_email = 51
            idx_title = 105
            idx_company = 167
    
    # Parse the lines
    for line_idx, line in enumerate(lines):
        # Skip header line
        if "SNo" in line and "Email" in line:
            continue
        if not line.strip():
            continue
            
        # Extract fields using offsets
        sno = line[idx_sno:idx_name].strip() if idx_name > idx_sno else ""
        name = line[idx_name:idx_email].strip() if idx_email > idx_name else ""
        email = line[idx_email:idx_title].strip() if idx_title > idx_email else ""
        title = line[idx_title:idx_company].strip() if idx_company > idx_title else ""
        company = line[idx_company:].strip()
        
        # Check if SNo is a valid number to identify a new row
        if sno.isdigit():
            # Basic validation for email
            is_valid_email = "@" in email and "." in email
            contacts.append({
                "sno": int(sno),
                "name": name,
                "email": email,
                "title": title,
                "company": company,
                "isValidEmail": is_valid_email,
                "page": page_idx + 1
            })
        else:
            # Check if this line actually contains text that we missed or if it's junk
            stripped = line.strip()
            if stripped and not stripped.startswith("Page") and not stripped.startswith("SNo"):
                unparsed_lines.append((page_idx + 1, line_idx + 1, stripped))

print(f"Total contacts extracted: {len(contacts)}")
print(f"Total unparsed non-empty lines: {len(unparsed_lines)}")

# Save to contacts.json
output_json_path = r"c:\Users\Keshav Kakani\Desktop\PROJECTS\emailsender\contacts.json"
with open(output_json_path, "w", encoding="utf-8") as f:
    json.dump(contacts, f, indent=2)

print(f"Saved contacts to {output_json_path}")

# Print first 5 contacts as sample
print("\nSample of first 5 contacts:")
for c in contacts[:5]:
    print(c)
