/**
 * IGLÚ WEB APP — BACKEND API BRIDGE
 * ------------------------------------------------------
 * This file is ONLY a JSON API that connects the GitHub-hosted
 * frontend to Google Sheets. It does NOT render any HTML and
 * does NOT serve the website. The website lives on GitHub Pages
 * and talks to this API using fetch().
 *
 * Deploy this as a Web App (Execute as: Me, Access: Anyone)
 * and copy the resulting /exec URL into script.js -> API_URL.
 * ------------------------------------------------------
 */

// ============================================================
// CONFIG
// ============================================================

const SHEET_NAMES = {
  BRANCHES: 'Branches',
  EMPLOYEES: 'Employees',
  SALES: 'Sales',
  ATTENDANCE: 'Attendance',
  SETTINGS: 'Settings'
};

const ADMIN_USERNAME = 'Iglu@dmin';
const ADMIN_PASSWORD = '1614';

const HEADERS = {
  Branches: ['Branch ID', 'Branch Name', 'Location', 'Status', 'Date Created'],
  Employees: ['Employee ID', 'Name', 'Username', 'Password', 'Branch ID', 'Position', 'Status', 'Date Created'],
  Sales: [
    'Transaction ID', 'Date', 'Time', 'Branch ID', 'Branch Name',
    'Employee ID', 'Employee Name', 'Product Type', 'Product Price',
    'Product Grams', 'Product Size', 'Quantity', 'Initial Price',
    'Discount Type', 'Discount Amount', 'Final Price', 'Amount Given',
    'Change', 'Payment Method', 'GCash Reference'
  ],
  Attendance: [
    'Attendance ID', 'Employee ID', 'Employee Name', 'Branch ID',
    'Branch Name', 'Date', 'Time In', 'Time Out', 'Duration', 'Status'
  ],
  Settings: ['Key', 'Value']
};

// ============================================================
// ENTRY POINTS
// ============================================================

function doGet(e) {
  return jsonResponse({ success: true, message: 'IGLU API is running. Use POST with an action.' });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ success: false, message: 'No request body received.' });
    }
    const request = JSON.parse(e.postData.contents);
    const action = request.action;
    if (!action) {
      return jsonResponse({ success: false, message: 'Missing "action" in request.' });
    }
    return jsonResponse(handleRequest(action, request));
  } catch (err) {
    return jsonResponse({ success: false, message: 'Server error: ' + err.message });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// ROUTER
// ============================================================

function handleRequest(action, request) {
  switch (action) {
    case 'login': return login(request);

    case 'getBranches': return getBranches();
    case 'createBranch': return createBranch(request.branch);
    case 'updateBranch': return updateBranch(request.branch);

    case 'getEmployees': return getEmployees(request);
    case 'createEmployee': return createEmployee(request.employee);
    case 'updateEmployee': return updateEmployee(request.employee);
    case 'disableEmployee': return setEmployeeStatus(request.employeeId, 'Disabled');
    case 'enableEmployee': return setEmployeeStatus(request.employeeId, 'Active');

    case 'recordSale': return recordSale(request);
    case 'getSales': return getSales(request);

    case 'timeIn': return timeIn(request);
    case 'timeOut': return timeOut(request);
    case 'getAttendance': return getAttendance(request);

    case 'getAnalytics': return getAnalytics(request);

    case 'setupSheetsRemote': return { success: false, message: 'Run setupSheets() from the Apps Script editor, not the API.' };

    default:
      return { success: false, message: 'Unknown action: ' + action };
  }
}

// ============================================================
// SHEET HELPERS
// ============================================================

function getSS() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet(name) {
  const sheet = getSS().getSheetByName(name);
  if (!sheet) throw new Error('Sheet not found: ' + name + '. Run setupSheets() first.');
  return sheet;
}

function sheetToObjects(sheetName) {
  const sheet = getSheet(sheetName);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  const rows = values.slice(1);
  return rows
    .filter(row => row.join('') !== '')
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i]; });
      return obj;
    });
}

function appendRow(sheetName, rowObj) {
  const sheet = getSheet(sheetName);
  const headers = HEADERS[sheetName];
  const row = headers.map(h => (rowObj[h] !== undefined ? rowObj[h] : ''));
  sheet.appendRow(row);
}

function findRowIndexById(sheetName, idColumnName, idValue) {
  const sheet = getSheet(sheetName);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idCol = headers.indexOf(idColumnName);
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idCol]) === String(idValue)) return i + 1; // 1-indexed sheet row
  }
  return -1;
}

function generateId(prefix) {
  return prefix + '-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'GMT', 'yyyyMMddHHmmss') + '-' + Math.floor(Math.random() * 1000);
}

// ============================================================
// SETUP — ONE-TIME SPREADSHEET PREPARATION ONLY
// This does NOT create or serve the website.
// ============================================================

function setupSheets() {
  const ss = getSS();

  Object.keys(SHEET_NAMES).forEach(key => {
    const name = SHEET_NAMES[key];
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
    }
    const headers = HEADERS[name];
    const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    const hasHeaders = headers.every((h, i) => firstRow[i] === h);
    if (!hasHeaders) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    }
  });

  // Remove default "Sheet1" if it's empty and unused
  const defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && defaultSheet.getDataRange().getValues().join('') === '') {
    ss.deleteSheet(defaultSheet);
  }

  // Seed Settings with defaults if empty
  const settingsSheet = getSheet(SHEET_NAMES.SETTINGS);
  if (settingsSheet.getLastRow() < 2) {
    settingsSheet.appendRow(['SeniorDiscountPercent', 20]);
    settingsSheet.appendRow(['PWDDiscountPercent', 20]);
  }

  Logger.log('setupSheets() complete. Sheets ready: ' + Object.values(SHEET_NAMES).join(', '));
}

// ============================================================
// AUTH
// ============================================================

function login(request) {
  const username = (request.username || '').trim();
  const password = (request.password || '').trim();

  if (!username || !password) {
    return { success: false, message: 'Username and password are required.' };
  }

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    return {
      success: true,
      data: { role: 'admin', username: ADMIN_USERNAME, name: 'Administrator' }
    };
  }

  const employees = sheetToObjects(SHEET_NAMES.EMPLOYEES);
  const match = employees.find(emp =>
    String(emp['Username']) === username && String(emp['Password']) === password
  );

  if (!match) {
    return { success: false, message: 'Invalid username or password.' };
  }
  if (match['Status'] !== 'Active') {
    return { success: false, message: 'This account is disabled. Contact your administrator.' };
  }

  return {
    success: true,
    data: {
      role: 'employee',
      employeeId: match['Employee ID'],
      name: match['Name'],
      username: match['Username'],
      branchId: match['Branch ID'],
      position: match['Position']
    }
  };
}

// ============================================================
// BRANCHES
// ============================================================

function getBranches() {
  return { success: true, data: sheetToObjects(SHEET_NAMES.BRANCHES) };
}

function createBranch(branch) {
  if (!branch || !branch.branchName) {
    return { success: false, message: 'Branch name is required.' };
  }
  const branchId = generateId('BR');
  appendRow(SHEET_NAMES.BRANCHES, {
    'Branch ID': branchId,
    'Branch Name': branch.branchName,
    'Location': branch.location || '',
    'Status': 'Active',
    'Date Created': new Date()
  });
  return { success: true, message: 'Branch created successfully.', data: { branchId: branchId } };
}

function updateBranch(branch) {
  if (!branch || !branch.branchId) {
    return { success: false, message: 'Branch ID is required.' };
  }
  const rowIndex = findRowIndexById(SHEET_NAMES.BRANCHES, 'Branch ID', branch.branchId);
  if (rowIndex === -1) return { success: false, message: 'Branch not found.' };

  const sheet = getSheet(SHEET_NAMES.BRANCHES);
  const headers = HEADERS[SHEET_NAMES.BRANCHES];
  if (branch.branchName !== undefined) sheet.getRange(rowIndex, headers.indexOf('Branch Name') + 1).setValue(branch.branchName);
  if (branch.location !== undefined) sheet.getRange(rowIndex, headers.indexOf('Location') + 1).setValue(branch.location);
  if (branch.status !== undefined) sheet.getRange(rowIndex, headers.indexOf('Status') + 1).setValue(branch.status);

  return { success: true, message: 'Branch updated successfully.' };
}

// ============================================================
// EMPLOYEES
// ============================================================

function getEmployees(request) {
  let employees = sheetToObjects(SHEET_NAMES.EMPLOYEES);
  if (request && request.branchId) {
    employees = employees.filter(e => String(e['Branch ID']) === String(request.branchId));
  }
  employees = employees.map(e => {
    const copy = Object.assign({}, e);
    delete copy['Password'];
    return copy;
  });
  return { success: true, data: employees };
}

function createEmployee(employee) {
  if (!employee || !employee.name || !employee.username || !employee.password || !employee.branchId) {
    return { success: false, message: 'Name, username, password, and branch are required.' };
  }
  const existing = sheetToObjects(SHEET_NAMES.EMPLOYEES);
  if (existing.some(e => String(e['Username']) === String(employee.username))) {
    return { success: false, message: 'Username already exists.' };
  }
  const employeeId = generateId('EMP');
  appendRow(SHEET_NAMES.EMPLOYEES, {
    'Employee ID': employeeId,
    'Name': employee.name,
    'Username': employee.username,
    'Password': employee.password,
    'Branch ID': employee.branchId,
    'Position': employee.position || 'Cashier',
    'Status': 'Active',
    'Date Created': new Date()
  });
  return { success: true, message: 'Employee created successfully.', data: { employeeId: employeeId } };
}

function updateEmployee(employee) {
  if (!employee || !employee.employeeId) {
    return { success: false, message: 'Employee ID is required.' };
  }
  const rowIndex = findRowIndexById(SHEET_NAMES.EMPLOYEES, 'Employee ID', employee.employeeId);
  if (rowIndex === -1) return { success: false, message: 'Employee not found.' };

  const sheet = getSheet(SHEET_NAMES.EMPLOYEES);
  const headers = HEADERS[SHEET_NAMES.EMPLOYEES];
  const fieldMap = {
    name: 'Name', username: 'Username', password: 'Password',
    branchId: 'Branch ID', position: 'Position', status: 'Status'
  };
  Object.keys(fieldMap).forEach(key => {
    if (employee[key] !== undefined && employee[key] !== '') {
      sheet.getRange(rowIndex, headers.indexOf(fieldMap[key]) + 1).setValue(employee[key]);
    }
  });
  return { success: true, message: 'Employee updated successfully.' };
}

function setEmployeeStatus(employeeId, status) {
  if (!employeeId) return { success: false, message: 'Employee ID is required.' };
  const rowIndex = findRowIndexById(SHEET_NAMES.EMPLOYEES, 'Employee ID', employeeId);
  if (rowIndex === -1) return { success: false, message: 'Employee not found.' };
  const sheet = getSheet(SHEET_NAMES.EMPLOYEES);
  const headers = HEADERS[SHEET_NAMES.EMPLOYEES];
  sheet.getRange(rowIndex, headers.indexOf('Status') + 1).setValue(status);
  return { success: true, message: 'Employee ' + (status === 'Active' ? 'enabled' : 'disabled') + ' successfully.' };
}

// ============================================================
// SALES
// ============================================================

function recordSale(request) {
  const sale = request.sale;
  if (!sale || !sale.employeeId || !sale.branchId || !sale.items || !sale.items.length) {
    return { success: false, message: 'Incomplete sale data.' };
  }

  // Verify employee belongs to the claimed branch (server-side branch restriction)
  const employees = sheetToObjects(SHEET_NAMES.EMPLOYEES);
  const employee = employees.find(e => String(e['Employee ID']) === String(sale.employeeId));
  if (!employee) return { success: false, message: 'Employee not found.' };
  if (String(employee['Branch ID']) !== String(sale.branchId)) {
    return { success: false, message: 'Employee is not authorized for this branch.' };
  }
  if (employee['Status'] !== 'Active') {
    return { success: false, message: 'Employee account is disabled.' };
  }

  const branches = sheetToObjects(SHEET_NAMES.BRANCHES);
  const branch = branches.find(b => String(b['Branch ID']) === String(sale.branchId));
  if (!branch) return { success: false, message: 'Branch not found.' };

  const transactionId = generateId('TXN');
  const now = new Date();
  const dateStr = Utilities.formatDate(now, Session.getScriptTimeZone() || 'GMT', 'yyyy-MM-dd');
  const timeStr = Utilities.formatDate(now, Session.getScriptTimeZone() || 'GMT', 'HH:mm:ss');

  const paymentMethod = sale.paymentMethod === 'GCash' ? 'GCash' : 'Cash';
  const gcashRef = paymentMethod === 'GCash' ? (sale.gcashReference || '') : 'N/A';

  sale.items.forEach(item => {
    const qty = Number(item.quantity) || 1;
    const price = Number(item.price) || 0;
    const initialPrice = price * qty;

    let discountType = sale.discountType || 'No Discount';
    let discountPercent = 0;
    if (discountType === 'Senior Citizen' || discountType === 'PWD') discountPercent = 20;
    const discountAmount = round2(initialPrice * (discountPercent / 100));
    const finalPrice = round2(initialPrice - discountAmount);

    appendRow(SHEET_NAMES.SALES, {
      'Transaction ID': transactionId,
      'Date': dateStr,
      'Time': timeStr,
      'Branch ID': branch['Branch ID'],
      'Branch Name': branch['Branch Name'],
      'Employee ID': employee['Employee ID'],
      'Employee Name': employee['Name'],
      'Product Type': item.productType || '',
      'Product Price': price,
      'Product Grams': item.grams || '',
      'Product Size': item.size || '',
      'Quantity': qty,
      'Initial Price': initialPrice,
      'Discount Type': discountType,
      'Discount Amount': discountAmount,
      'Final Price': finalPrice,
      'Amount Given': paymentMethod === 'Cash' ? (Number(sale.amountGiven) || 0) : '',
      'Change': paymentMethod === 'Cash' ? (Number(sale.change) || 0) : '',
      'Payment Method': paymentMethod,
      'GCash Reference': gcashRef
    });
  });

  return { success: true, message: 'Sale recorded successfully.', data: { transactionId: transactionId } };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function getSales(request) {
  let sales = sheetToObjects(SHEET_NAMES.SALES);
  if (request) {
    if (request.branchId) sales = sales.filter(s => String(s['Branch ID']) === String(request.branchId));
    if (request.employeeId) sales = sales.filter(s => String(s['Employee ID']) === String(request.employeeId));
    if (request.dateFrom) sales = sales.filter(s => String(s['Date']) >= request.dateFrom);
    if (request.dateTo) sales = sales.filter(s => String(s['Date']) <= request.dateTo);
  }
  return { success: true, data: sales };
}

// ============================================================
// ATTENDANCE
// ============================================================

function timeIn(request) {
  if (!request.employeeId) return { success: false, message: 'Employee ID is required.' };

  const employees = sheetToObjects(SHEET_NAMES.EMPLOYEES);
  const employee = employees.find(e => String(e['Employee ID']) === String(request.employeeId));
  if (!employee) return { success: false, message: 'Employee not found.' };

  const branches = sheetToObjects(SHEET_NAMES.BRANCHES);
  const branch = branches.find(b => String(b['Branch ID']) === String(employee['Branch ID']));

  const now = new Date();
  const dateStr = Utilities.formatDate(now, Session.getScriptTimeZone() || 'GMT', 'yyyy-MM-dd');
  const timeStr = Utilities.formatDate(now, Session.getScriptTimeZone() || 'GMT', 'HH:mm:ss');

  // Prevent duplicate open time-in for the same day
  const attendance = sheetToObjects(SHEET_NAMES.ATTENDANCE);
  const openEntry = attendance.find(a =>
    String(a['Employee ID']) === String(request.employeeId) &&
    String(a['Date']) === dateStr &&
    (!a['Time Out'] || a['Time Out'] === '')
  );
  if (openEntry) {
    return { success: false, message: 'You already timed in today and have not timed out yet.' };
  }

  const attendanceId = generateId('ATT');
  appendRow(SHEET_NAMES.ATTENDANCE, {
    'Attendance ID': attendanceId,
    'Employee ID': employee['Employee ID'],
    'Employee Name': employee['Name'],
    'Branch ID': employee['Branch ID'],
    'Branch Name': branch ? branch['Branch Name'] : '',
    'Date': dateStr,
    'Time In': timeStr,
    'Time Out': '',
    'Duration': '',
    'Status': 'Timed In'
  });

  return { success: true, message: 'Timed in successfully.', data: { attendanceId: attendanceId, time: timeStr } };
}

function timeOut(request) {
  if (!request.employeeId) return { success: false, message: 'Employee ID is required.' };

  const sheet = getSheet(SHEET_NAMES.ATTENDANCE);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];

  const empIdCol = headers.indexOf('Employee ID');
  const timeOutCol = headers.indexOf('Time Out');
  const dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'GMT', 'yyyy-MM-dd');
  const dateCol = headers.indexOf('Date');

  let targetRow = -1;
  for (let i = values.length - 1; i >= 1; i--) {
    if (String(values[i][empIdCol]) === String(request.employeeId) &&
        String(values[i][dateCol]) === dateStr &&
        (!values[i][timeOutCol] || values[i][timeOutCol] === '')) {
      targetRow = i + 1;
      break;
    }
  }

  if (targetRow === -1) {
    return { success: false, message: 'No open time-in found for today.' };
  }

  const now = new Date();
  const timeStr = Utilities.formatDate(now, Session.getScriptTimeZone() || 'GMT', 'HH:mm:ss');
  const timeInStr = sheet.getRange(targetRow, headers.indexOf('Time In') + 1).getValue();
  const duration = calculateDuration(timeInStr, timeStr);

  sheet.getRange(targetRow, timeOutCol + 1).setValue(timeStr);
  sheet.getRange(targetRow, headers.indexOf('Duration') + 1).setValue(duration);
  sheet.getRange(targetRow, headers.indexOf('Status') + 1).setValue('Timed Out');

  return { success: true, message: 'Timed out successfully.', data: { time: timeStr, duration: duration } };
}

function calculateDuration(timeInStr, timeOutStr) {
  try {
    const [inH, inM, inS] = String(timeInStr).split(':').map(Number);
    const [outH, outM, outS] = String(timeOutStr).split(':').map(Number);
    let totalSeconds = (outH * 3600 + outM * 60 + outS) - (inH * 3600 + inM * 60 + inS);
    if (totalSeconds < 0) totalSeconds += 24 * 3600;
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    return h + 'h ' + m + 'm';
  } catch (err) {
    return '';
  }
}

function getAttendance(request) {
  let attendance = sheetToObjects(SHEET_NAMES.ATTENDANCE);
  if (request) {
    if (request.employeeId) attendance = attendance.filter(a => String(a['Employee ID']) === String(request.employeeId));
    if (request.branchId) attendance = attendance.filter(a => String(a['Branch ID']) === String(request.branchId));
    if (request.dateFrom) attendance = attendance.filter(a => String(a['Date']) >= request.dateFrom);
    if (request.dateTo) attendance = attendance.filter(a => String(a['Date']) <= request.dateTo);
  }
  return { success: true, data: attendance };
}

// ============================================================
// ANALYTICS
// ============================================================

function getAnalytics(request) {
  const filters = (request && request.filters) || {};
  let sales = sheetToObjects(SHEET_NAMES.SALES);

  if (filters.branchId) sales = sales.filter(s => String(s['Branch ID']) === String(filters.branchId));
  if (filters.dateFrom) sales = sales.filter(s => String(s['Date']) >= filters.dateFrom);
  if (filters.dateTo) sales = sales.filter(s => String(s['Date']) <= filters.dateTo);

  const branches = sheetToObjects(SHEET_NAMES.BRANCHES);

  return { success: true, data: { sales: sales, branches: branches } };
}
