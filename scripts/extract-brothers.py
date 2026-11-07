"""Read only the Brother Interview Sheet; leave the workbook unchanged."""
import sys,json,datetime,re
from pathlib import Path
import openpyxl
source=Path(sys.argv[1]);target=Path(sys.argv[2])
book=openpyxl.load_workbook(source,read_only=True,data_only=True)
sheet=book['Brother Interview Sheet']
def text(v):
    if v is None: return ''
    if isinstance(v,(datetime.datetime,datetime.date)): return v.isoformat()
    return str(v).strip()
records=[];seen=set()
for cells in sheet.iter_rows(min_row=2):
    values=[c.value for c in cells]
    values += [None]*max(0,22-len(values))
    if not values[0] and not values[1]: continue
    first,last=text(values[0]),text(values[1]);email=text(values[21]).lower()
    if not first or not last or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',email):
        raise ValueError(f'Incomplete name or invalid email in row {cells[0].row}')
    if email in seen: raise ValueError(f'Duplicate email in row {cells[0].row}')
    seen.add(email)
    availability={day:{'text':text(values[col]),'needsConfirmation':isinstance(values[col],(datetime.datetime,datetime.date))} for day,col in zip(['Monday','Tuesday','Wednesday','Thursday','Friday'],range(16,21))}
    records.append({'name':first+' '+last,'email':email,'profile':{'firstName':first,'lastName':last,'linkedIn':text(values[2]),'graduation':text(values[3]),'rushClass':text(values[4]),'majors':[text(values[i]) for i in (5,6,7) if text(values[i])],'minors':text(values[8]),'certificates':text(values[9]),'currentLeadership':text(values[10]),'priorLeadership':text(values[11]),'otherLeadership':text(values[12]),'internships':text(values[13]),'upcomingInternships':text(values[14]),'hobbies':text(values[15]),'availability':availability,'source':{'workbook':source.name,'sheet':sheet.title,'row':cells[0].row}}})
if not records: raise ValueError('No brother records found')
target.parent.mkdir(parents=True,exist_ok=True)
target.write_text(json.dumps({'source':source.name,'sheet':sheet.title,'brothers':records},indent=2));target.chmod(0o600)
print(json.dumps({'imported':len(records),'availabilityCellsToConfirm':sum(s['needsConfirmation'] for r in records for s in r['profile']['availability'].values()),'profilesToConfirm':sum(any(s['needsConfirmation'] for s in r['profile']['availability'].values()) for r in records)}))
