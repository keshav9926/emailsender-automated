import pypdf
import re

pdf_path = r"c:\Users\Keshav Kakani\Desktop\PROJECTS\emailsender\CompanyWise HR contact (1) (1).pdf"
reader = pypdf.PdfReader(pdf_path)

counts = {}
sample_mismatches = []

for page_idx, page in enumerate(reader.pages):
    text = page.extract_text(extraction_mode="layout")
    lines = text.split("\n")
    for line_idx, line in enumerate(lines):
        line_stripped = line.strip()
        if not line_stripped:
            continue
        
        # Skip headers
        if "SNo" in line_stripped and "Email" in line_stripped:
            continue
            
        # Split by 2 or more spaces
        parts = re.split(r'\s{2,}', line_stripped)
        
        # Check if the first part is a serial number
        if parts[0].isdigit():
            num_parts = len(parts)
            counts[num_parts] = counts.get(num_parts, 0) + 1
            if num_parts != 5:
                sample_mismatches.append((page_idx+1, line_idx+1, num_parts, parts))

print("Distribution of parts count per record line:")
for k, v in sorted(counts.items()):
    print(f"{k} parts: {v} lines")

print("\nSample mismatches (not 5 parts):")
for page, line, num, parts in sample_mismatches[:10]:
    print(f"Page {page}, Line {line} ({num} parts): {parts}")
