// js/ledger.js
import { getStore } from './db.js';

// 1. سعر الصرف
export async function getLiveFXRate() {
  const store = await getStore('settings', 'readonly');
  return new Promise((resolve) => {
    const req = store.get('fx_rate_usd_syp');
    req.onsuccess = () => resolve(req.result ? req.result.value : 14500);
    req.onerror = () => resolve(14500);
  });
}

export async function setLiveFXRate(rate) {
  const store = await getStore('settings', 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.put({ key: 'fx_rate_usd_syp', value: Number(rate), updatedAt: new Date().toISOString() });
    req.onsuccess = () => resolve(true);
    req.onerror = (e) => reject(e.target.error);
  });
}

// 2. إدارة المحافظ الواقعية (إنشاء / جلب)
export async function ensureAccount(name, currency = 'SYP') {
  const store = await getStore('accounts', 'readwrite');
  return new Promise((resolve, reject) => {
    const index = store.index('name');
    const req = index.get(name);
    req.onsuccess = () => {
      if (req.result) return resolve(req.result);
      const newAcc = { name, currency, createdAt: new Date().toISOString() };
      const addReq = store.add(newAcc);
      addReq.onsuccess = () => resolve({ id: addReq.result, ...newAcc });
      addReq.onerror = (e) => reject(e.target.error);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function getAllAccounts() {
  const store = await getStore('accounts', 'readonly');
  return new Promise((resolve) => {
    store.getAll().onsuccess = (e) => resolve(e.target.result || []);
  });
}

// 3. إدارة المشاريع (إنشاء / جلب)
export async function ensureProject(name) {
  const store = await getStore('projects', 'readwrite');
  return new Promise((resolve, reject) => {
    const index = store.index('name');
    const req = index.get(name);
    req.onsuccess = () => {
      if (req.result) return resolve(req.result);
      const newProj = { name, createdAt: new Date().toISOString() };
      const addReq = store.add(newProj);
      addReq.onsuccess = () => resolve({ id: addReq.result, ...newProj });
      addReq.onerror = (e) => reject(e.target.error);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function getAllProjects() {
  const store = await getStore('projects', 'readonly');
  return new Promise((resolve) => {
    store.getAll().onsuccess = (e) => resolve(e.target.result || []);
  });
}

// 4. تسجيل قيد في دفتر الأستاذ
export async function recordTransaction({
  type,             // 'INCOME', 'EXPENSE', 'TRANSFER', 'MANUAL_ADJUST'
  account,          // اسم المحفظة الواقعية
  toAccount = null, // محفظة الهدف في حال التحويل
  project = 'عام',  // اسم المشروع / المسار
  amount,
  currency,
  description = '',
  customFxRate = null
}) {
  const currentFx = customFxRate || await getLiveFXRate();
  await ensureAccount(account, currency);
  if (toAccount) await ensureAccount(toAccount, currency);
  if (project) await ensureProject(project);

  const store = await getStore('transactions', 'readwrite');
  const tx = {
    timestamp: new Date().toISOString(),
    type,
    account,
    toAccount,
    project,
    amount: Number(amount),
    currency,
    fxRateSnapshot: Number(currentFx),
    description,
    status: 'ACTIVE'
  };

  return new Promise((resolve, reject) => {
    const req = store.add(tx);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

// 5. حساب أرصدة المحافظ الواقعية ديناميكياً
export async function calculatePhysicalBalances() {
  const accounts = await getAllAccounts();
  const txStore = await getStore('transactions', 'readonly');

  return new Promise((resolve) => {
    const balances = {};
    accounts.forEach(a => balances[a.name] = { amount: 0, currency: a.currency });

    txStore.getAll().onsuccess = (e) => {
      const records = e.target.result || [];
      records.forEach((tx) => {
        if (tx.status === 'VOIDED') return;

        if (!balances[tx.account]) {
          balances[tx.account] = { amount: 0, currency: tx.currency };
        }

        if (tx.type === 'INCOME') {
          balances[tx.account].amount += tx.amount;
        } else if (tx.type === 'EXPENSE') {
          balances[tx.account].amount -= tx.amount;
        } else if (tx.type === 'MANUAL_ADJUST') {
          balances[tx.account].amount = tx.amount;
        }
      });
      resolve(balances);
    };
  });
}

// 6. حساب صافي أرباح ومصروفات المشاريع ديناميكياً
export async function calculateProjectProfits() {
  const projects = await getAllProjects();
  const txStore = await getStore('transactions', 'readonly');

  return new Promise((resolve) => {
    const report = {};
    projects.forEach(p => {
      report[p.name] = { incomeSYP: 0, expenseSYP: 0, incomeUSD: 0, expenseUSD: 0, netSYP: 0, netUSD: 0 };
    });

    txStore.getAll().onsuccess = (e) => {
      const records = e.target.result || [];
      records.forEach((tx) => {
        if (tx.status === 'VOIDED' || !tx.project) return;
        if (!report[tx.project]) {
          report[tx.project] = { incomeSYP: 0, expenseSYP: 0, incomeUSD: 0, expenseUSD: 0, netSYP: 0, netUSD: 0 };
        }

        const isUSD = tx.currency === 'USD';
        if (tx.type === 'INCOME') {
          if (isUSD) report[tx.project].incomeUSD += tx.amount;
          else report[tx.project].incomeSYP += tx.amount;
        } else if (tx.type === 'EXPENSE') {
          if (isUSD) report[tx.project].expenseUSD += tx.amount;
          else report[tx.project].expenseSYP += tx.amount;
        }
      });

      Object.keys(report).forEach(k => {
        report[k].netSYP = report[k].incomeSYP - report[k].expenseSYP;
        report[k].netUSD = report[k].incomeUSD - report[k].expenseUSD;
      });

      resolve(report);
    };
  });
}

// 7. إدارة سجل الديون والأمانات
export async function recordDebt({ person, amount, currency, direction, project = 'عام', note = '' }) {
  const store = await getStore('debts', 'readwrite');
  const debtRecord = {
    createdAt: new Date().toISOString(),
    person,
    amount: Number(amount),
    currency,
    direction,
    project,
    note,
    status: 'ACTIVE'
  };

  return new Promise((resolve, reject) => {
    const req = store.add(debtRecord);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function settleDebt(debtId, note = '') {
  const store = await getStore('debts', 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.get(Number(debtId));
    req.onsuccess = () => {
      const debt = req.result;
      if (!debt) return reject('الدين غير موجود');
      debt.status = 'SETTLED';
      debt.settledAt = new Date().toISOString();
      if (note) debt.note += ` (تسوية: ${note})`;
      const putReq = store.put(debt);
      putReq.onsuccess = () => resolve(true);
      putReq.onerror = (e) => reject(e.target.error);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function getActiveDebts() {
  const store = await getStore('debts', 'readonly');
  return new Promise((resolve) => {
    store.getAll().onsuccess = (e) => {
      const active = (e.target.result || []).filter(d => d.status === 'ACTIVE');
      resolve(active);
    };
  });
}