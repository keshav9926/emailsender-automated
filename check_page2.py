import pypdf

pdf_path = r"c:\Users\Keshav Kakani\Desktop\PROJECTS\emailsender\CompanyWise HR contact (1) (1).pdf"
reader = pypdf.PdfReader(pdf_path)

page = reader.pages[1] # Page 2
text_layout = page.extract_text(extraction_mode="layout")

with open("layout_page2.txt", "w", encoding="utf-8") as f:
    f.write(text_layout)

print("Page 2 layout mode text sample:")
lines = text_layout.split("\n")
for idx, line in enumerate(lines[:10]):
    print(f"{idx+1}: {repr(line)}")
