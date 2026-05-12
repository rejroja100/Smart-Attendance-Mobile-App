import openpyxl
from openpyxl.styles import PatternFill, Font, Alignment
from openpyxl.utils import get_column_letter
import csv
import io
from datetime import datetime


class ExportService:
    @staticmethod
    def generate_excel(course, students, attendance_map, dates):
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Attendance"

        ws['A1'] = f"Course: {course['name']}"
        ws['A2'] = f"Code: {course['code']}"
        ws['A3'] = f"Teacher: {course.get('teacherName','')}"
        ws['A4'] = f"Export Date: {datetime.now().strftime('%Y-%m-%d')}"
        for r in range(1, 5):
            ws.cell(row=r, column=1).font = Font(bold=True)

        headers = ['Student Name', 'Roll Number'] + dates + ['Total Present', 'Total Classes', 'Percentage']
        header_fill = PatternFill(fill_type='solid', fgColor='2F4F4F')
        header_font = Font(bold=True, color='FFFFFF')

        for col, header in enumerate(headers, 1):
            cell = ws.cell(row=6, column=col, value=header)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal='center')

        green_fill = PatternFill(fill_type='solid', fgColor='C6EFCE')
        red_fill = PatternFill(fill_type='solid', fgColor='FFC7CE')
        grey_fill = PatternFill(fill_type='solid', fgColor='F2F2F2')
        yellow_fill = PatternFill(fill_type='solid', fgColor='FFEB9C')

        for row, student in enumerate(students, 7):
            records = attendance_map.get(student['id'], {})
            present_count = 0
            ws.cell(row=row, column=1, value=student.get('name', ''))
            ws.cell(row=row, column=2, value=student.get('roll', ''))

            for col, date in enumerate(dates, 3):
                if date in records:
                    if records[date]:
                        cell = ws.cell(row=row, column=col, value='P')
                        cell.fill = green_fill
                        present_count += 1
                    else:
                        cell = ws.cell(row=row, column=col, value='A')
                        cell.fill = red_fill
                else:
                    cell = ws.cell(row=row, column=col, value='-')
                    cell.fill = grey_fill
                cell.alignment = Alignment(horizontal='center')

            total = len(dates)
            pct = round((present_count / total * 100), 1) if total > 0 else 0
            ws.cell(row=row, column=len(dates) + 3, value=present_count)
            ws.cell(row=row, column=len(dates) + 4, value=total)
            pct_cell = ws.cell(row=row, column=len(dates) + 5, value=f"{pct}%")
            if pct >= 75:
                pct_cell.fill = green_fill
            elif pct >= 50:
                pct_cell.fill = yellow_fill
            else:
                pct_cell.fill = red_fill

        # Auto-fit columns
        for col_cells in ws.columns:
            max_len = 0
            col_letter = get_column_letter(col_cells[0].column)
            for cell in col_cells:
                v = '' if cell.value is None else str(cell.value)
                if len(v) > max_len:
                    max_len = len(v)
            ws.column_dimensions[col_letter].width = max_len + 4

        ws.freeze_panes = 'C7'

        buffer = io.BytesIO()
        wb.save(buffer)
        buffer.seek(0)
        return buffer

    @staticmethod
    def generate_csv(course, students, attendance_map, dates):
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow([f"Course: {course['name']}"])
        writer.writerow([f"Code: {course['code']}"])
        writer.writerow([f"Teacher: {course.get('teacherName','')}"])
        writer.writerow([f"Export Date: {datetime.now().strftime('%Y-%m-%d')}"])
        writer.writerow([])
        writer.writerow(['Student Name', 'Roll Number'] + dates + ['Total Present', 'Total Classes', 'Percentage'])
        for student in students:
            records = attendance_map.get(student['id'], {})
            present_count = 0
            row = [student.get('name', ''), student.get('roll', '')]
            for date in dates:
                if date in records:
                    if records[date]:
                        row.append('P'); present_count += 1
                    else:
                        row.append('A')
                else:
                    row.append('-')
            total = len(dates)
            pct = round((present_count / total * 100), 1) if total > 0 else 0
            row += [present_count, total, f"{pct}%"]
            writer.writerow(row)
        buffer.seek(0)
        return buffer


def build_attendance_export_payload(course: dict, db):
    """Build (course, students_list, attendance_map, dates_sorted) for export.

    For each enrolled student, reads attendance/{courseId}_{studentId}, collapses
    multiple records per date into a single boolean (present if ANY record is True),
    and aggregates the unique sorted dates across the course.
    """
    course_id = course.get("id")
    students_list = list(course.get("enrolledStudents") or [])

    attendance_map: dict[str, dict[str, bool]] = {}
    all_dates: set[str] = set()

    for student in students_list:
        sid = (student or {}).get("id")
        if not sid:
            continue
        doc_id = f"{course_id}_{sid}"
        snap = db.collection("attendance").document(doc_id).get()
        per_date: dict[str, bool] = {}
        if snap.exists:
            data = snap.to_dict() or {}
            for rec in data.get("records", []) or []:
                date = rec.get("date")
                present = bool(rec.get("present"))
                if not date:
                    continue
                # Present if ANY record on the date is True
                per_date[date] = per_date.get(date, False) or present
                all_dates.add(date)
        attendance_map[sid] = per_date

    dates_sorted = sorted(all_dates)
    return course, students_list, attendance_map, dates_sorted
