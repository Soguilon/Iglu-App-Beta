/**
 * IGLÚ WEB APP — FRONTEND LOGIC
 * ------------------------------------------------------
 * This file runs entirely on GitHub Pages (or any static host).
 * It talks to the Google Apps Script backend ONLY through fetch().
 * It never uses google.script.run / google.script.host / google.script.url.
 * ------------------------------------------------------
 */

// ============================================================
// CONFIGURATION — REPLACE WITH YOUR APPS SCRIPT WEB APP URL
// ============================================================
const API_URL = "https://script.google.com/macros/s/AKfycbxUhA2ezIcOUXl6_LmSMFEvenQyaQffJzfvfB8bLI7QNafhZ52xjpf4bsXCyZ7EQ9cclg/exec";

// ============================================================
// STATE
// ============================================================
let currentUser = null; // { role, name, username, employeeId?, branchId?, position? }
let cashierItems = [];
let itemCounter = 0;
let branchesCache = [];
let employeesCache = [];
let charts = {};

const PRODUCT_SIZES = ['8 oz', '12 oz', '16 oz', '22 oz'];

// ============================================================
// API HELPER — the ONLY way the frontend talks to the backend
// ============================================================
async function apiCall(action, payload = {}) {
  if (!API_URL || API_URL.indexOf('https://script.google.com/macros/s/AKfycbxUhA2ezIcOUXl6_LmSMFEvenQyaQffJzfvfB8bLI7QNafhZ52xjpf4bsXCyZ7EQ9cclg/exec') === 0) {
    showToast('API_URL is not configured yet. Edit script.js.', 'error');
    return { success: false, message: 'API_URL not configured.' };
  }
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action }, payload))
    });
    return await response.json();
  } catch (err) {
    showToast('Network error contacting the API.', 'error');
    return { success: false, message: 'Network error: ' + err.message };
  }
}

// ============================================================
// TOASTS
// ============================================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'iglu-toast ' + type;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

function money(n) {
  const num = Number(n) || 0;
  return '₱' + num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ============================================================
// SESSION (sessionStorage only — authorization still validated server-side)
// ============================================================
function saveSession(user) {
  sessionStorage.setItem('iglu_user', JSON.stringify(user));
}
function loadSession() {
  const raw = sessionStorage.getItem('iglu_user');
  return raw ? JSON.parse(raw) : null;
}
function clearSession() {
  sessionStorage.removeItem('iglu_user');
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  const existing = loadSession();
  if (existing) {
    currentUser = existing;
    enterApp();
  }
  bindLoginForm();
  bindNav();
  bindSidebarToggle();
  bindLogout();
  bindCashier();
  bindAttendanceButtons();
  bindModals();
  bindSalesFilters();
});

// ============================================================
// LOGIN
// ============================================================
function bindLoginForm() {
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value.trim();
    const errorBox = document.getElementById('login-error');
    const btn = document.getElementById('login-btn');
    errorBox.classList.add('d-none');
    setBtnLoading(btn, true);

    const res = await apiCall('login', { username, password });

    setBtnLoading(btn, false);
    if (!res.success) {
      errorBox.textContent = res.message || 'Login failed.';
      errorBox.classList.remove('d-none');
      return;
    }
    currentUser = res.data;
    saveSession(currentUser);
    enterApp();
  });
}

function setBtnLoading(btn, loading) {
  btn.disabled = loading;
  btn.querySelector('.btn-label').classList.toggle('d-none', loading);
  btn.querySelector('.btn-spinner').classList.toggle('d-none', !loading);
}

function bindLogout() {
  document.getElementById('logout-btn').addEventListener('click', () => {
    clearSession();
    currentUser = null;
    document.getElementById('view-app').classList.add('d-none');
    document.getElementById('view-login').classList.remove('d-none');
    document.getElementById('login-form').reset();
  });
}

// ============================================================
// ENTER APP
// ============================================================
async function enterApp() {
  document.getElementById('view-login').classList.add('d-none');
  document.getElementById('view-app').classList.remove('d-none');

  document.getElementById('sidebar-user-name').textContent = currentUser.name || currentUser.username;
  document.getElementById('sidebar-user-role').textContent = currentUser.role;

  if (currentUser.role === 'admin') {
    document.getElementById('admin-nav').classList.remove('d-none');
    document.getElementById('employee-nav').classList.add('d-none');
    await loadBranchesCache();
    switchView('admin-dashboard', 'Dashboard');
  } else {
    document.getElementById('employee-nav').classList.remove('d-none');
    document.getElementById('admin-nav').classList.add('d-none');
    const badge = document.getElementById('topbar-branch');
    badge.classList.remove('d-none');
    await loadBranchesCache();
    const branch = branchesCache.find(b => String(b['Branch ID']) === String(currentUser.branchId));
    badge.querySelector('span').textContent = branch ? branch['Branch Name'] : currentUser.branchId;
    switchView('emp-dashboard', 'Dashboard');
    setupCashierEmployeeStrip(branch);
  }
}

// ============================================================
// NAVIGATION
// ============================================================
function bindNav() {
  document.querySelectorAll('.sidebar-nav .nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const view = link.dataset.view;
      document.querySelectorAll('.sidebar-nav .nav-link').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      switchView(view, link.textContent.trim());
      closeSidebarMobile();
    });
  });
}

function switchView(viewId, title) {
  document.querySelectorAll('.view-panel').forEach(p => p.classList.add('d-none'));
  const panel = document.getElementById(viewId);
  if (panel) panel.classList.remove('d-none');
  document.getElementById('page-title').textContent = title;

  const loaders = {
    'admin-dashboard': loadAdminDashboard,
    'admin-branches': loadAdminBranches,
    'admin-employees': loadAdminEmployees,
    'admin-sales': loadAdminSales,
    'admin-attendance': loadAdminAttendance,
    'admin-analytics': loadAdminAnalytics,
    'admin-compare': loadAdminCompare,
    'emp-dashboard': loadEmpDashboard,
    'emp-cashier': loadEmpCashier,
    'emp-attendance': loadEmpAttendance,
    'emp-history': loadEmpHistory
  };
  if (loaders[viewId]) loaders[viewId]();
}

function bindSidebarToggle() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  document.getElementById('hamburger').addEventListener('click', () => {
    sidebar.classList.add('show');
    overlay.classList.add('show');
  });
  document.getElementById('sidebar-close').addEventListener('click', closeSidebarMobile);
  overlay.addEventListener('click', closeSidebarMobile);
}
function closeSidebarMobile() {
  document.getElementById('sidebar').classList.remove('show');
  document.getElementById('sidebar-overlay').classList.remove('show');
}

// ============================================================
// SHARED: BRANCHES CACHE
// ============================================================
async function loadBranchesCache() {
  const res = await apiCall('getBranches');
  if (res.success) branchesCache = res.data;
  return branchesCache;
}

function branchNameById(id) {
  const b = branchesCache.find(x => String(x['Branch ID']) === String(id));
  return b ? b['Branch Name'] : id;
}

// ============================================================
// ADMIN: DASHBOARD
// ============================================================
async function loadAdminDashboard() {
  const [branchesRes, employeesRes, salesRes] = await Promise.all([
    apiCall('getBranches'),
    apiCall('getEmployees', {}),
    apiCall('getSales', {})
  ]);

  const branches = branchesRes.success ? branchesRes.data : [];
  const employees = employeesRes.success ? employeesRes.data : [];
  const sales = salesRes.success ? salesRes.data : [];

  branchesCache = branches;

  const totalSales = sales.reduce((sum, s) => sum + (Number(s['Final Price']) || 0), 0);
  const txnIds = new Set(sales.map(s => s['Transaction ID']));

  document.getElementById('stat-total-sales').textContent = money(totalSales);
  document.getElementById('stat-branches').textContent = branches.length;
  document.getElementById('stat-employees').textContent = employees.length;
  document.getElementById('stat-transactions').textContent = txnIds.size;

  renderSalesTrendChart(sales);
  renderPaymentChart(sales);
}

function renderSalesTrendChart(sales) {
  const days = [];
  const today = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  const totals = days.map(day =>
    sales.filter(s => String(s['Date']) === day).reduce((sum, s) => sum + (Number(s['Final Price']) || 0), 0)
  );
  renderChart('chart-admin-sales-trend', 'line', {
    labels: days.map(d => d.slice(5)),
    datasets: [{
      label: 'Sales', data: totals,
      borderColor: '#0aa5b8', backgroundColor: 'rgba(10,165,184,0.12)',
      fill: true, tension: 0.35, pointRadius: 2
    }]
  });
}

function renderPaymentChart(sales) {
  const cash = sales.filter(s => s['Payment Method'] === 'Cash').length;
  const gcash = sales.filter(s => s['Payment Method'] === 'GCash').length;
  renderChart('chart-admin-payment', 'doughnut', {
    labels: ['Cash', 'GCash'],
    datasets: [{ data: [cash, gcash], backgroundColor: ['#0aa5b8', '#7fd8e3'] }]
  });
}

function renderChart(canvasId, type, data) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  if (charts[canvasId]) charts[canvasId].destroy();
  charts[canvasId] = new Chart(ctx, {
    type, data,
    options: { responsive: true, plugins: { legend: { display: type !== 'line' } } }
  });
}

// ============================================================
// ADMIN: BRANCHES
// ============================================================
async function loadAdminBranches() {
  const res = await apiCall('getBranches');
  const tbody = document.querySelector('#table-branches tbody');
  tbody.innerHTML = '';
  if (!res.success) return;
  branchesCache = res.data;
  populateBranchFilters();

  res.data.forEach(b => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(b['Branch Name'])}</td>
      <td>${escapeHtml(b['Location'] || '—')}</td>
      <td><span class="status-pill ${b['Status'] === 'Active' ? 'status-active' : 'status-disabled'}">${escapeHtml(b['Status'])}</span></td>
      <td>${formatDateCell(b['Date Created'])}</td>
      <td><button class="btn btn-sm btn-outline-iglu edit-branch-btn"><i class="fa-solid fa-pen"></i></button></td>
    `;
    tr.querySelector('.edit-branch-btn').addEventListener('click', () => openEditBranch(b));
    tbody.appendChild(tr);
  });
}

function openEditBranch(b) {
  document.getElementById('branch-id-field').value = b['Branch ID'];
  document.getElementById('branch-name-field').value = b['Branch Name'];
  document.getElementById('branch-location-field').value = b['Location'] || '';
  document.querySelector('#modal-branch .modal-title').textContent = 'Edit Branch';
  new bootstrap.Modal(document.getElementById('modal-branch')).show();
}

function bindModals() {
  document.querySelector('[data-bs-target="#modal-branch"]').addEventListener('click', () => {
    document.getElementById('form-branch').reset();
    document.getElementById('branch-id-field').value = '';
    document.querySelector('#modal-branch .modal-title').textContent = 'New Branch';
  });

  document.getElementById('form-branch').addEventListener('submit', async (e) => {
    e.preventDefault();
    const branchId = document.getElementById('branch-id-field').value;
    const name = document.getElementById('branch-name-field').value.trim();
    const location = document.getElementById('branch-location-field').value.trim();
    const errorBox = document.getElementById('branch-form-error');
    errorBox.classList.add('d-none');

    const res = branchId
      ? await apiCall('updateBranch', { branch: { branchId, branchName: name, location } })
      : await apiCall('createBranch', { branch: { branchName: name, location } });

    if (!res.success) {
      errorBox.textContent = res.message || 'Unable to save branch.';
      errorBox.classList.remove('d-none');
      return;
    }
    bootstrap.Modal.getInstance(document.getElementById('modal-branch')).hide();
    showToast(res.message || 'Branch saved.', 'success');
    loadAdminBranches();
  });

  document.querySelector('[data-bs-target="#modal-employee"]').addEventListener('click', async () => {
    document.getElementById('form-employee').reset();
    document.getElementById('employee-id-field').value = '';
    document.querySelector('#modal-employee .modal-title').textContent = 'New Employee';
    await populateEmployeeBranchSelect();
  });

  document.getElementById('form-employee').addEventListener('submit', async (e) => {
    e.preventDefault();
    const employeeId = document.getElementById('employee-id-field').value;
    const name = document.getElementById('employee-name-field').value.trim();
    const username = document.getElementById('employee-username-field').value.trim();
    const password = document.getElementById('employee-password-field').value.trim();
    const branchId = document.getElementById('employee-branch-field').value;
    const position = document.getElementById('employee-position-field').value.trim() || 'Cashier';
    const errorBox = document.getElementById('employee-form-error');
    errorBox.classList.add('d-none');

    const res = employeeId
      ? await apiCall('updateEmployee', { employee: { employeeId, name, username, password, branchId, position } })
      : await apiCall('createEmployee', { employee: { name, username, password, branchId, position } });

    if (!res.success) {
      errorBox.textContent = res.message || 'Unable to save employee.';
      errorBox.classList.remove('d-none');
      return;
    }
    bootstrap.Modal.getInstance(document.getElementById('modal-employee')).hide();
    showToast(res.message || 'Employee saved.', 'success');
    loadAdminEmployees();
  });
}

async function populateEmployeeBranchSelect(selected) {
  if (!branchesCache.length) await loadBranchesCache();
  const select = document.getElementById('employee-branch-field');
  select.innerHTML = branchesCache.map(b => `<option value="${b['Branch ID']}">${escapeHtml(b['Branch Name'])}</option>`).join('');
  if (selected) select.value = selected;
}

// ============================================================
// ADMIN: EMPLOYEES
// ============================================================
async function loadAdminEmployees() {
  if (!branchesCache.length) await loadBranchesCache();
  const res = await apiCall('getEmployees', {});
  const tbody = document.querySelector('#table-employees tbody');
  tbody.innerHTML = '';
  if (!res.success) return;
  employeesCache = res.data;

  res.data.forEach(emp => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(emp['Name'])}</td>
      <td>${escapeHtml(emp['Username'])}</td>
      <td>${escapeHtml(branchNameById(emp['Branch ID']))}</td>
      <td>${escapeHtml(emp['Position'] || '—')}</td>
      <td><span class="status-pill ${emp['Status'] === 'Active' ? 'status-active' : 'status-disabled'}">${escapeHtml(emp['Status'])}</span></td>
      <td>
        <button class="btn btn-sm btn-outline-iglu edit-emp-btn"><i class="fa-solid fa-pen"></i></button>
        <button class="btn btn-sm btn-outline-danger toggle-emp-btn"><i class="fa-solid ${emp['Status'] === 'Active' ? 'fa-ban' : 'fa-check'}"></i></button>
      </td>
    `;
    tr.querySelector('.edit-emp-btn').addEventListener('click', async () => {
      document.getElementById('employee-id-field').value = emp['Employee ID'];
      document.getElementById('employee-name-field').value = emp['Name'];
      document.getElementById('employee-username-field').value = emp['Username'];
      document.getElementById('employee-password-field').value = '';
      document.getElementById('employee-position-field').value = emp['Position'] || '';
      await populateEmployeeBranchSelect(emp['Branch ID']);
      document.querySelector('#modal-employee .modal-title').textContent = 'Edit Employee';
      new bootstrap.Modal(document.getElementById('modal-employee')).show();
    });
    tr.querySelector('.toggle-emp-btn').addEventListener('click', async () => {
      const action = emp['Status'] === 'Active' ? 'disableEmployee' : 'enableEmployee';
      const res2 = await apiCall(action, { employeeId: emp['Employee ID'] });
      showToast(res2.message || 'Updated.', res2.success ? 'success' : 'error');
      loadAdminEmployees();
    });
    tbody.appendChild(tr);
  });
}

// ============================================================
// ADMIN: SALES
// ============================================================
function bindSalesFilters() {
  document.getElementById('sales-filter-btn').addEventListener('click', loadAdminSales);
}

function populateBranchFilters() {
  const selects = ['sales-branch-filter', 'attendance-branch-filter'];
  selects.forEach(id => {
    const select = document.getElementById(id);
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = '<option value="">All Branches</option>' +
      branchesCache.map(b => `<option value="${b['Branch ID']}">${escapeHtml(b['Branch Name'])}</option>`).join('');
    select.value = currentVal;
  });
}

async function loadAdminSales() {
  if (!branchesCache.length) await loadBranchesCache();
  populateBranchFilters();
  const branchId = document.getElementById('sales-branch-filter').value;
  const dateFrom = document.getElementById('sales-date-from').value;
  const dateTo = document.getElementById('sales-date-to').value;

  const res = await apiCall('getSales', { branchId, dateFrom, dateTo });
  const tbody = document.querySelector('#table-sales tbody');
  tbody.innerHTML = '';
  if (!res.success) return;

  res.data.slice().reverse().forEach(s => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="text-truncate" style="max-width:120px">${escapeHtml(s['Transaction ID'])}</td>
      <td>${escapeHtml(s['Date'])}</td>
      <td>${escapeHtml(s['Branch Name'])}</td>
      <td>${escapeHtml(s['Employee Name'])}</td>
      <td>${escapeHtml(s['Product Type'])}</td>
      <td>${escapeHtml(String(s['Quantity']))}</td>
      <td>${money(s['Final Price'])}</td>
      <td>${escapeHtml(s['Payment Method'])}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ============================================================
// ADMIN: ATTENDANCE
// ============================================================
async function loadAdminAttendance() {
  if (!branchesCache.length) await loadBranchesCache();
  populateBranchFilters();
  const branchId = document.getElementById('attendance-branch-filter').value;

  document.getElementById('attendance-branch-filter').onchange = loadAdminAttendance;

  const res = await apiCall('getAttendance', { branchId });
  const tbody = document.querySelector('#table-attendance tbody');
  tbody.innerHTML = '';
  if (!res.success) return;

  res.data.slice().reverse().forEach(a => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(a['Employee Name'])}</td>
      <td>${escapeHtml(a['Branch Name'])}</td>
      <td>${escapeHtml(a['Date'])}</td>
      <td>${escapeHtml(a['Time In'])}</td>
      <td>${escapeHtml(a['Time Out'] || '—')}</td>
      <td>${escapeHtml(a['Duration'] || '—')}</td>
      <td><span class="status-pill ${a['Status'] === 'Timed In' ? 'status-active' : 'status-disabled'}">${escapeHtml(a['Status'])}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// ============================================================
// ADMIN: ANALYTICS
// ============================================================
async function loadAdminAnalytics() {
  const res = await apiCall('getAnalytics', { filters: {} });
  if (!res.success) return;
  const sales = res.data.sales;

  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const year = today.slice(0, 4);

  const dailyTotal = sumFinal(sales.filter(s => s['Date'] === today));
  const monthlyTotal = sumFinal(sales.filter(s => String(s['Date']).startsWith(month)));
  const yearlyTotal = sumFinal(sales.filter(s => String(s['Date']).startsWith(year)));
  const totalTotal = sumFinal(sales);
  const avg = sales.length ? totalTotal / sales.length : 0;
  const highest = sales.length ? Math.max(...sales.map(s => Number(s['Final Price']) || 0)) : 0;
  const lowest = sales.length ? Math.min(...sales.map(s => Number(s['Final Price']) || 0)) : 0;

  document.getElementById('an-daily').textContent = money(dailyTotal);
  document.getElementById('an-monthly').textContent = money(monthlyTotal);
  document.getElementById('an-yearly').textContent = money(yearlyTotal);
  document.getElementById('an-average').textContent = money(avg);
  document.getElementById('an-highest').textContent = money(highest);
  document.getElementById('an-lowest').textContent = money(lowest);

  const productTotals = {};
  sales.forEach(s => {
    const key = s['Product Type'] || 'Unknown';
    productTotals[key] = (productTotals[key] || 0) + (Number(s['Final Price']) || 0);
  });
  const sortedProducts = Object.entries(productTotals).sort((a, b) => b[1] - a[1]).slice(0, 8);
  renderChart('chart-top-products', 'bar', {
    labels: sortedProducts.map(p => p[0]),
    datasets: [{ label: 'Sales', data: sortedProducts.map(p => p[1]), backgroundColor: '#0aa5b8' }]
  });

  const discountTotals = {};
  sales.forEach(s => {
    const key = s['Discount Type'] || 'No Discount';
    discountTotals[key] = (discountTotals[key] || 0) + 1;
  });
  renderChart('chart-discounts', 'doughnut', {
    labels: Object.keys(discountTotals),
    datasets: [{ data: Object.values(discountTotals), backgroundColor: ['#0aa5b8', '#7fd8e3', '#c8f1f5'] }]
  });
}

function sumFinal(sales) {
  return sales.reduce((sum, s) => sum + (Number(s['Final Price']) || 0), 0);
}

// ============================================================
// ADMIN: BRANCH COMPARISON
// ============================================================
async function loadAdminCompare() {
  if (!branchesCache.length) await loadBranchesCache();
  const res = await apiCall('getSales', {});
  if (!res.success) return;
  const sales = res.data;

  const totals = branchesCache.map(b => {
    const branchSales = sales.filter(s => String(s['Branch ID']) === String(b['Branch ID']));
    return sumFinal(branchSales);
  });

  renderChart('chart-branch-compare', 'bar', {
    labels: branchesCache.map(b => b['Branch Name']),
    datasets: [{ label: 'Total Sales', data: totals, backgroundColor: '#0aa5b8' }]
  });
}

// ============================================================
// EMPLOYEE: DASHBOARD
// ============================================================
async function loadEmpDashboard() {
  document.getElementById('emp-info-id').textContent = currentUser.employeeId;
  document.getElementById('emp-info-name').textContent = currentUser.name;
  document.getElementById('emp-info-position').textContent = currentUser.position || '—';

  if (!branchesCache.length) await loadBranchesCache();
  const branch = branchesCache.find(b => String(b['Branch ID']) === String(currentUser.branchId));
  document.getElementById('emp-info-branch').textContent = branch ? branch['Branch Name'] : currentUser.branchId;

  const res = await apiCall('getAttendance', { employeeId: currentUser.employeeId });
  const statusBox = document.getElementById('emp-today-status');
  if (res.success) {
    const today = new Date().toISOString().slice(0, 10);
    const todayEntry = res.data.find(a => a['Date'] === today);
    if (!todayEntry) {
      statusBox.innerHTML = '<i class="fa-solid fa-circle-info"></i><span>You have not timed in today.</span>';
    } else if (!todayEntry['Time Out']) {
      statusBox.innerHTML = `<i class="fa-solid fa-clock"></i><span>Timed in at ${escapeHtml(todayEntry['Time In'])}. Still on shift.</span>`;
    } else {
      statusBox.innerHTML = `<i class="fa-solid fa-check"></i><span>Shift complete — ${escapeHtml(todayEntry['Duration'])}</span>`;
    }
  }
}

// ============================================================
// EMPLOYEE: CASHIER
// ============================================================
function setupCashierEmployeeStrip(branch) {
  document.getElementById('cashier-emp-id').textContent = currentUser.employeeId;
  document.getElementById('cashier-emp-name').textContent = currentUser.name;
  document.getElementById('cashier-branch').textContent = branch ? branch['Branch Name'] : currentUser.branchId;
}

function loadEmpCashier() {
  if (!cashierItems.length) addCashierItem();
  recalcSummary();
}

function bindCashier() {
  document.getElementById('add-item-btn').addEventListener('click', addCashierItem);
  document.getElementById('cashier-discount').addEventListener('change', recalcSummary);
  document.getElementById('cashier-amount-given').addEventListener('input', recalcSummary);

  document.querySelectorAll('input[name="payment-method"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const isCash = document.getElementById('pay-cash').checked;
      document.getElementById('cash-fields').classList.toggle('d-none', !isCash);
      document.getElementById('gcash-fields').classList.toggle('d-none', isCash);
      recalcSummary();
    });
  });

  document.getElementById('complete-sale-btn').addEventListener('click', completeSale);
}

function addCashierItem() {
  itemCounter++;
  const id = 'item-' + itemCounter;
  cashierItems.push({ id, productType: '', price: 0, grams: '', size: '8 oz', quantity: 1 });
  renderCashierItems();
}

function removeCashierItem(id) {
  cashierItems = cashierItems.filter(i => i.id !== id);
  if (!cashierItems.length) addCashierItem();
  renderCashierItems();
}

function renderCashierItems() {
  const container = document.getElementById('cashier-items');
  container.innerHTML = '';
  cashierItems.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'item-row';
    row.innerHTML = `
      <div class="item-row-header">
        <span>Item ${idx + 1}</span>
        <button type="button" class="remove-item-btn" data-id="${item.id}"><i class="fa-solid fa-trash"></i></button>
      </div>
      <div class="row g-2">
        <div class="col-6 col-md-3">
          <label class="form-label small">Product Type</label>
          <input type="text" class="form-control form-control-sm field-productType" data-id="${item.id}" value="${escapeHtmlAttr(item.productType)}" placeholder="e.g. Classic Milk Tea">
        </div>
        <div class="col-6 col-md-2">
          <label class="form-label small">Price</label>
          <input type="number" min="0" step="0.01" class="form-control form-control-sm field-price" data-id="${item.id}" value="${item.price}">
        </div>
        <div class="col-6 col-md-2">
          <label class="form-label small">Grams</label>
          <input type="text" class="form-control form-control-sm field-grams" data-id="${item.id}" value="${escapeHtmlAttr(item.grams)}" placeholder="e.g. 250g">
        </div>
        <div class="col-6 col-md-2">
          <label class="form-label small">Size</label>
          <select class="form-select form-select-sm field-size" data-id="${item.id}">
            ${PRODUCT_SIZES.map(s => `<option value="${s}" ${s === item.size ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="col-6 col-md-2">
          <label class="form-label small">Quantity</label>
          <input type="number" min="1" step="1" class="form-control form-control-sm field-quantity" data-id="${item.id}" value="${item.quantity}">
        </div>
      </div>
    `;
    container.appendChild(row);
  });

  container.querySelectorAll('.remove-item-btn').forEach(btn =>
    btn.addEventListener('click', () => removeCashierItem(btn.dataset.id)));

  container.querySelectorAll('.field-productType').forEach(el =>
    el.addEventListener('input', () => updateItemField(el.dataset.id, 'productType', el.value)));
  container.querySelectorAll('.field-price').forEach(el =>
    el.addEventListener('input', () => updateItemField(el.dataset.id, 'price', Number(el.value) || 0)));
  container.querySelectorAll('.field-grams').forEach(el =>
    el.addEventListener('input', () => updateItemField(el.dataset.id, 'grams', el.value)));
  container.querySelectorAll('.field-size').forEach(el =>
    el.addEventListener('change', () => updateItemField(el.dataset.id, 'size', el.value)));
  container.querySelectorAll('.field-quantity').forEach(el =>
    el.addEventListener('input', () => updateItemField(el.dataset.id, 'quantity', Math.max(1, Number(el.value) || 1))));
}

function updateItemField(id, field, value) {
  const item = cashierItems.find(i => i.id === id);
  if (item) item[field] = value;
  recalcSummary();
}

function recalcSummary() {
  const initial = cashierItems.reduce((sum, i) => sum + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
  const discountType = document.getElementById('cashier-discount').value;
  const discountPercent = (discountType === 'Senior Citizen' || discountType === 'PWD') ? 20 : 0;
  const discount = round2(initial * (discountPercent / 100));
  const final = round2(initial - discount);

  const isCash = document.getElementById('pay-cash').checked;
  const given = isCash ? (Number(document.getElementById('cashier-amount-given').value) || 0) : final;
  const change = isCash ? round2(given - final) : 0;

  document.getElementById('sum-initial').textContent = money(initial);
  document.getElementById('sum-discount').textContent = money(discount);
  document.getElementById('sum-final').textContent = money(final);
  document.getElementById('sum-given').textContent = isCash ? money(given) : '—';
  document.getElementById('sum-change').textContent = isCash ? money(Math.max(change, 0)) : '—';

  return { initial, discount, final, given, change, discountType, isCash };
}

function round2(n) { return Math.round(n * 100) / 100; }

async function completeSale() {
  const errorBox = document.getElementById('cashier-error');
  errorBox.classList.add('d-none');

  const invalidItem = cashierItems.find(i => !i.productType || !i.price || i.price <= 0);
  if (invalidItem) {
    errorBox.textContent = 'Every item needs a product type and a price greater than 0.';
    errorBox.classList.remove('d-none');
    return;
  }

  const summary = recalcSummary();
  const isCash = summary.isCash;

  if (isCash && summary.given < summary.final) {
    errorBox.textContent = 'Amount given is less than the final price.';
    errorBox.classList.remove('d-none');
    return;
  }

  const gcashRef = document.getElementById('cashier-gcash-ref').value.trim();
  if (!isCash && !gcashRef) {
    errorBox.textContent = 'GCash reference number is required.';
    errorBox.classList.remove('d-none');
    return;
  }

  const btn = document.getElementById('complete-sale-btn');
  setBtnLoading(btn, true);

  const sale = {
    employeeId: currentUser.employeeId,
    branchId: currentUser.branchId,
    discountType: summary.discountType,
    paymentMethod: isCash ? 'Cash' : 'GCash',
    amountGiven: isCash ? summary.given : '',
    change: isCash ? Math.max(summary.change, 0) : '',
    gcashReference: !isCash ? gcashRef : '',
    items: cashierItems.map(i => ({
      productType: i.productType, price: i.price, grams: i.grams, size: i.size, quantity: i.quantity
    }))
  };

  const res = await apiCall('recordSale', { sale });
  setBtnLoading(btn, false);

  if (!res.success) {
    errorBox.textContent = res.message || 'Unable to complete sale.';
    errorBox.classList.remove('d-none');
    return;
  }

  showToast('Sale completed: ' + res.data.transactionId, 'success');
  cashierItems = [];
  addCashierItem();
  document.getElementById('cashier-discount').value = 'No Discount';
  document.getElementById('cashier-amount-given').value = '';
  document.getElementById('cashier-gcash-ref').value = '';
  document.getElementById('pay-cash').checked = true;
  document.getElementById('cash-fields').classList.remove('d-none');
  document.getElementById('gcash-fields').classList.add('d-none');
  recalcSummary();
}

// ============================================================
// EMPLOYEE: ATTENDANCE (TIME IN / OUT)
// ============================================================
let clockInterval = null;

function bindAttendanceButtons() {
  document.getElementById('time-in-btn').addEventListener('click', async () => {
    const res = await apiCall('timeIn', { employeeId: currentUser.employeeId });
    showToast(res.message, res.success ? 'success' : 'error');
    loadEmpAttendance();
  });
  document.getElementById('time-out-btn').addEventListener('click', async () => {
    const res = await apiCall('timeOut', { employeeId: currentUser.employeeId });
    showToast(res.message, res.success ? 'success' : 'error');
    loadEmpAttendance();
  });
}

async function loadEmpAttendance() {
  if (clockInterval) clearInterval(clockInterval);
  updateClock();
  clockInterval = setInterval(updateClock, 1000);

  const res = await apiCall('getAttendance', { employeeId: currentUser.employeeId });
  const statusBox = document.getElementById('emp-attendance-status');
  if (res.success) {
    const today = new Date().toISOString().slice(0, 10);
    const todayEntry = res.data.find(a => a['Date'] === today && !a['Time Out']);
    if (todayEntry) {
      statusBox.innerHTML = `<i class="fa-solid fa-clock"></i><span>Currently timed in since ${escapeHtml(todayEntry['Time In'])}</span>`;
    } else {
      statusBox.innerHTML = '<i class="fa-solid fa-circle-info"></i><span>Not currently timed in.</span>';
    }
  }
}

function updateClock() {
  document.getElementById('emp-clock').textContent = new Date().toLocaleTimeString('en-PH');
}

// ============================================================
// EMPLOYEE: ATTENDANCE HISTORY
// ============================================================
async function loadEmpHistory() {
  const res = await apiCall('getAttendance', { employeeId: currentUser.employeeId });
  const tbody = document.querySelector('#table-emp-history tbody');
  tbody.innerHTML = '';
  if (!res.success) return;
  res.data.slice().reverse().forEach(a => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(a['Date'])}</td>
      <td>${escapeHtml(a['Time In'])}</td>
      <td>${escapeHtml(a['Time Out'] || '—')}</td>
      <td>${escapeHtml(a['Duration'] || '—')}</td>
      <td><span class="status-pill ${a['Status'] === 'Timed In' ? 'status-active' : 'status-disabled'}">${escapeHtml(a['Status'])}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// ============================================================
// UTIL
// ============================================================
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
function escapeHtmlAttr(str) { return escapeHtml(str); }

function formatDateCell(val) {
  if (!val) return '—';
  const d = new Date(val);
  if (isNaN(d.getTime())) return escapeHtml(String(val));
  return d.toLocaleDateString('en-PH');
}
