import pypdf
import os

pdf_path = r"c:\Users\Keshav Kakani\Desktop\PROJECTS\emailsender\CompanyWise HR contact (1) (1).pdf"
output_path = r"c:\Users\Keshav Kakani\Desktop\PROJECTS\emailsender\pdf_sample.txt"

print(f"Reading {pdf_path}...")
reader = pypdf.PdfReader(pdf_path)
num_pages = len(reader.pages)
print(f"Number of pages: {num_pages}")

extracted_text = []
for i in range(min(5, num_pages)):
    print(f"Reading page {i+1}...")
    page = reader.pages[i]
    text = page.extract_text()
    extracted_text.append(f"--- PAGE {i+1} ---")
    extracted_text.append(text)

with open(output_path, "w", encoding="utf-8") as f:
    f.write("\n".join(extracted_text))

print(f"Sample text written to {output_path}")
