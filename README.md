# BeMath

BeMath is a learning platform for administrators and students, built
with Next.js, TypeScript, Tailwind CSS, MongoDB, and Firebase Realtime Database.

## Getting started

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and set the MongoDB URI, session secret,
   and `BLOB_READ_WRITE_TOKEN`.
3. Start the development server with `npm run dev`.

Use a unique random `SESSION_SECRET` of at least 32 characters. Keep
`.env.local` private.
For Firebase realtime signals, set the `NEXT_PUBLIC_FIREBASE_*` client settings
and `FIREBASE_SERVICE_ACCOUNT_JSON` to the Firebase service account JSON. Never
expose or commit the service account.
Set `BLOB_READ_WRITE_TOKEN` from a Vercel Blob read/write token in `.env.local`
and in the Vercel project's environment variables. Admins can paste screenshots
into task content; images are stored as public Blob URLs and can be displayed at
10–100% width.

The app writes only lesson update timestamps to Realtime Database; answers,
correctness, and task content remain in MongoDB. To let browsers subscribe to
these non-sensitive signals, configure Realtime Database rules as follows:

```json
{
  "rules": {
    ".write": false,
    "lessonSignals": {
      "$lessonId": {
        ".read": true,
        ".write": false
      }
    }
  }
}
```

When Firebase is not configured or unavailable, the admin and student panels
continue refreshing from authenticated MongoDB APIs using polling.

## API foundation

All request and response bodies use JSON. Authentication uses an HTTP-only,
same-site session cookie.

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | Public | Sign in with email and password |
| POST | `/api/auth/logout` | Public | Clear the session cookie |
| GET | `/api/auth/me` | Signed in | Get the current account |
| GET, POST | `/api/groups` | Admin | List active groups and create a group |
| PATCH, DELETE | `/api/groups/:groupId` | Admin | Rename, enable/disable invite, or archive/restore a group |
| GET | `/api/students` | Admin | List students in managed groups |
| POST | `/api/auth/register` | Public | Register a student with a group invite code |
| GET | `/api/groups/join/:accessCode` | Public | Look up an active group invite |
| PATCH, DELETE | `/api/students/:studentId` | Admin | Approve, activate/deactivate, reset password, or permanently delete a managed student |
| GET, POST | `/api/tasks` | Admin | List tasks or create one in a required quiz |
| PATCH, DELETE | `/api/tasks/:taskId` | Admin | Edit a task or archive it and remove it from quizzes |
| POST | `/api/task-images` | Admin | Upload a task image to Vercel Blob |
| GET, POST | `/api/quizzes` | Admin | List or create quizzes |
| PATCH, DELETE | `/api/quizzes/:quizId` | Admin | Edit a quiz, add/remove tasks, or delete the quiz |
| GET, POST | `/api/assignments` | Admin | List and publish group homework |
| GET, POST | `/api/live-lessons` | Admin | List and prepare live lessons |
| PATCH | `/api/live-lessons/:lessonId` | Admin | Start, end, advance, or reopen a student's answer |
| GET | `/api/live-lessons/:lessonId/submissions` | Admin | Review answers and correctness for the active question |
| GET | `/api/student/dashboard` | Student | Load groups, homework, and active live question |
| POST | `/api/live-lessons/:lessonId/submissions` | Student | Submit one answer to the active live question |
| GET, POST | `/api/assignments/:assignmentId` | Student | Load homework and submit an answer |

The app screens are `/login`, `/admin`, `/admin/quizzes`,
`/admin/tasks`, `/admin/groups`,
`/admin/users`, `/join/:accessCode`, `/student/pending`, and `/student`.
Group invite links are disabled by default. Admins can enable or disable each
link from `/admin/groups`; a disabled link cannot be used to look up the group
or register. Students who register through an enabled link are signed in and
sent to a waiting page, but cannot access student APIs until approved from
`/admin/users`. The waiting page checks for approval automatically. Admins can
also activate or deactivate approved accounts, set a temporary password, and
permanently delete an account by confirming its email address. Permanent
deletion also removes the student's submissions and memberships and cannot be
undone. Live lesson
`PATCH` actions are `start`, `end`, `next-task`, and `reopen-student` (the latter
also requires `studentId`). A lesson starts with the configured timer (120
seconds by default). The API enforces the deadline and hides answer correctness
from students; the admin can view results and re-enable an individual student.
Homework answers can be submitted once per question and are graded immediately;
students see their own result. Firebase Realtime Database broadcasts lesson
change signals, with authenticated API polling as a fallback.

Quizzes are managed under `/admin/quizzes`; task CRUD is on `/admin/tasks`.
Creating a task requires selecting a quiz. The same task can be reused in
multiple quizzes, including mixed review quizzes. Homework and live lessons
accept one or more quizzes and snapshot their ordered tasks when created; later
quiz edits do not change already-published work or lessons. Deleting a task
archives it and removes it from quiz selections, while previously published
assignments and lessons retain the task for their existing results.
Task content supports ordered text and image blocks. Images are uploaded from
the task editor to Vercel Blob and rendered in student live lessons and homework.
Each image can have a maximum display width of up to 4096 pixels, in addition
to its relative width. Blob URLs are public, so do not upload images containing
private information.
Text blocks accept HTML for formatting. The server sanitizes HTML, allowing
basic headings, paragraphs, lists, links, tables, and inline emphasis while
removing scripts and unsafe attributes.

Group deletion is a soft archive: memberships and historical lessons/homework
remain intact. Archived groups are available under `/admin/groups` and can be
restored.

## Data models

MongoDB models cover users and roles, groups and memberships, typed quiz tasks,
homework assignments, live lesson state, and student submissions. Correct
answers and explanations are excluded from normal task queries by default.
