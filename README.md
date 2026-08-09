# IGLÚ Web App

**Architecture:** GitHub Pages (frontend) → `fetch()` → Google Apps Script (API) → Google Sheets (database)

Google Apps Script is **only** a JSON API bridge. It does not render or host the website. The website lives in `frontend/` and is deployed to GitHub Pages independently.

```
frontend/       → the actual website (HTML/CSS/JS + Bootstrap 5.3, Font Awesome, Chart.js)
apps-script/    → Code.gs — the API/database bridge only
```

---

## 1. Set up the Google Sheet + Apps Script backend

1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet (e.g. "IGLU Database").
2. In the sheet, open **Extensions → Apps Script**.
3. Delete any starter code, then paste the entire contents of `apps-script/Code.gs`.
4. Save the project (e.g. name it "IGLU API").
5. In the function dropdown at the top, select `setupSheets`, then click **Run**.
   - The first run will ask for authorization — approve it.
   - This creates the `Branches`, `Employees`, `Sales`, `Attendance`, and `Settings` sheets with headers.
   - `setupSheets()` is a **one-time** operation. It only prepares the spreadsheet — it never creates or serves the website.
6. Deploy the script as a Web App:
   - Click **Deploy → New deployment**.
   - Type: **Web app**.
   - Execute as: **Me**.
   - Who has access: **Anyone**.
   - Click **Deploy**, then copy the **Web app URL** (ends in `/exec`).

This URL is your API endpoint. You never open it in a browser to use the app — it's only called by the frontend's `fetch()` requests.

## 2. Configure the frontend

1. Open `frontend/script.js`.
2. Find this line near the top:
   ```javascript
   const API_URL = "YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL";
   ```
3. Replace it with the Web App URL you copied, e.g.:
   ```javascript
   const API_URL = "https://script.google.com/macros/s/AKfycbx.../exec";
   ```

## 3. Deploy the frontend to GitHub Pages

1. Create a new GitHub repository, e.g. `iglu-web-app`.
2. Upload everything inside `frontend/` to the **root** of the repository:
   - `index.html`
   - `styles.css`
   - `script.js`
   - `iglulogo.png` — add your own logo file with this exact name (not included in this package)
   - `iglu.ico` — add your own favicon file with this exact name (not included in this package)
   - Until you add them, the UI simply hides the logo image and uses the browser's default favicon — nothing breaks.
3. In the repository, go to **Settings → Pages**.
4. Under **Source**, choose the branch (e.g. `main`) and root folder, then save.
5. GitHub will give you a URL like:
   ```
   https://username.github.io/iglu-web-app/
   ```
6. Open that URL — this is your live website. You never need to open Apps Script again to use it.

## 4. Logging in

**Admin**
```
Username: Iglu@dmin
Password: 1614
```

**Employees** are created by the admin from the Employee Management screen. Each employee logs in with the username/password an admin sets, and can only see and act on their own assigned branch — this is enforced by the backend, not just hidden in the UI.

## 5. Notes on the architecture

- The frontend never uses `google.script.run`, `google.script.host`, or the Apps Script HTML service — it only uses `fetch(API_URL, …)`.
- Every request/response is JSON:
  ```json
  { "action": "getBranches" }
  ```
  ```json
  { "success": true, "data": [] }
  ```
- `Code.gs` is a single file containing `doGet`, `doPost`, `handleRequest`, and one function per API action (`getBranches`, `createBranch`, `login`, `recordSale`, `timeIn`, `timeOut`, `getAnalytics`, etc).
- Google Sheets is the only database — no MySQL, PHP, Firebase, Supabase, or other external database.
- If you ever change `Code.gs`, you must create a **new deployment** (or manage versions under **Deploy → Manage deployments**) for the changes to take effect on the live `/exec` URL.

## 6. Updating the app later

- **Frontend changes** (`index.html`, `styles.css`, `script.js`): just push to GitHub — GitHub Pages updates automatically.
- **Backend changes** (`Code.gs`): edit in the Apps Script editor, then redeploy the web app (Deploy → Manage deployments → Edit → New version).
