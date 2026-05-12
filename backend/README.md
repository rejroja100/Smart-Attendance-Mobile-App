# Smart Attendance API (FastAPI Backend)

Production-ready Python backend for the Smart Attendance Management System.
Built with FastAPI + Firebase Admin SDK (Firestore + Auth) + openpyxl.

## Features

- Firebase ID token authentication (`Authorization: Bearer <token>`)
- Teacher / student role enforcement
- Course management (create, list, enroll, remove, delete)
- Attendance via 6-character code (40 second window), Bluetooth sessions, and manual marking
- Excel (xlsx) and CSV exports with color-coded percentages
- Student dashboard with per-course attendance summary

## Project Layout

```
backend/
  main.py                 # FastAPI app + router wiring
  requirements.txt
  .env.example
  firestore.rules
  config/
    firebase_config.py    # Firebase Admin init (db + auth)
    settings.py           # env var helpers
  middleware/
    auth_middleware.py    # verify_firebase_token, require_role
  models/                 # Pydantic request/response models
  routers/                # auth, courses, attendance, students
  services/               # Business logic (auth, course, attendance, bluetooth, export)
  utils/helpers.py
```

## Setup

### 1. Clone & create a virtualenv

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1   # Windows PowerShell
# or:  source .venv/bin/activate    # macOS / Linux
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Set up Firebase

1. Create a Firebase project at <https://console.firebase.google.com/>.
2. Enable **Authentication** (Email/Password and/or Google sign-in).
3. Enable **Firestore Database** in Native mode.
4. Open **Project Settings → Service accounts → Generate new private key**.
5. Save the downloaded JSON file as `serviceAccountKey.json` in the `backend/` directory.
6. Deploy `firestore.rules`:
   ```bash
   firebase deploy --only firestore:rules
   ```

### 4. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```
FIREBASE_PROJECT_ID=your-project-id
SECRET_KEY=replace-with-a-strong-secret
ALLOWED_ORIGINS=http://localhost:8081,http://localhost:19006,*
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json
```

### 5. Run

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Open <http://localhost:8000/docs> for the interactive Swagger UI.

## API Overview

| Method | Path                                          | Role     | Purpose                              |
|--------|-----------------------------------------------|----------|--------------------------------------|
| POST   | `/api/auth/login`                             | any      | Create or fetch user profile         |
| GET    | `/api/auth/me`                                | any      | Current user                         |
| POST   | `/api/auth/logout`                            | any      | Revoke refresh tokens                |
| GET    | `/api/courses/teacher`                        | teacher  | Courses owned by teacher             |
| GET    | `/api/courses/student`                        | student  | Courses the student is enrolled in   |
| POST   | `/api/courses`                                | teacher  | Create course                        |
| DELETE | `/api/courses/{courseId}`                     | teacher  | Delete course                        |
| POST   | `/api/courses/{courseId}/enroll`              | student  | Enroll self                          |
| DELETE | `/api/courses/{courseId}/students/{sid}`      | teacher  | Remove a student                     |
| GET    | `/api/courses/{courseId}`                     | both     | Course details                       |
| POST   | `/api/attendance/code/submit`                 | teacher  | Start a 40s code session             |
| POST   | `/api/attendance/code/verify`                 | student  | Submit code, mark present            |
| POST   | `/api/attendance/manual`                      | teacher  | Bulk mark attendance                 |
| POST   | `/api/attendance/bluetooth/start`             | teacher  | Start a bluetooth session            |
| POST   | `/api/attendance/bluetooth/stop`              | teacher  | Stop bluetooth session               |
| POST   | `/api/attendance/bluetooth`                   | student  | Submit bluetooth attendance          |
| GET    | `/api/attendance/{courseId}`                  | both     | List records for a course            |
| GET    | `/api/attendance/{courseId}/export?format=xlsx\|csv` | teacher | Download spreadsheet         |
| GET    | `/api/students/dashboard`                     | student  | Per-course percentages and status    |

## Deployment to Render

1. Push this `backend/` directory to a Git repo (or include it in your monorepo).
2. Create a new **Web Service** on <https://render.com>.
3. Connect the repo and set:
   - **Environment**: Python
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Add the env vars from `.env` in the Render dashboard.
5. Upload the contents of `serviceAccountKey.json` as a **Secret File** named
   `serviceAccountKey.json` and set `GOOGLE_APPLICATION_CREDENTIALS=/etc/secrets/serviceAccountKey.json`.
6. Deploy. Your API will be live at `https://<service>.onrender.com`.

## Notes

- The 6-character session code is **whatever the teacher types** (validated `len == 6`,
  alphanumeric) and is always stored / compared in upper case.
- Code expires after **40 seconds**.
- Attendance docs use the id pattern `attendance/{courseId}_{studentId}` and store a
  `records: []` array; multiple records per day are preserved as history.
- All mutating endpoints require a Firebase ID token; teacher-only endpoints add a role check.
