import pypdf

pdf_path = r"c:\Users\Keshav Kakani\Desktop\PROJECTS\emailsender\CompanyWise HR contact (1) (1).pdf"
reader = pypdf.PdfReader(pdf_path)

# Try layout mode on page 1
page = reader.pages[0]
text_layout = page.extract_text(extraction_mode="layout")

with open("layout_sample.txt", "w", encoding="utf-8") as f:
    f.write(text_layout)

print("Layout mode extraction written to layout_sample.txt")
print("First 500 characters:")
print(text_layout[:500])
