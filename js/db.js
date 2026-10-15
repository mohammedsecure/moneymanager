// js/db.js
const DB_NAME = 'SmartLedgerDB';
const DB_VERSION = 2; // رفعنا الإصدار لدعم الجداول الديناميكية

let dbInstance = null;

export function initDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) return resolve(dbInstance);

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // 1. جدول المحافظ الحقيقية الديناميكية
      if (!db.objectStoreNames.contains('accounts')) {
        const accStore = db.createObjectStore('accounts', { keyPath: 'id', autoIncrement: true });
        accStore.createIndex('name', 'name', { unique: true });
      }

      // 2. جدول المشاريع والمسارات الديناميكية
      if (!db.objectStoreNames.contains('projects')) {
        const projStore = db.createObjectStore('projects', { keyPath: 'id', autoIncrement: true });
        projStore.createIndex('name', 'name', { unique: true });
      }

      // 3. دفتر الأستاذ العام
      if (!db.objectStoreNames.contains('transactions')) {
        const txStore = db.createObjectStore('transactions', { keyPath: 'id', autoIncrement: true });
        txStore.createIndex('timestamp', 'timestamp', { unique: false });
        txStore.createIndex('account', 'account', { unique: false });
        txStore.createIndex('project', 'project', { unique: false });
      }

      // 4. سجل الديون والذمم
      if (!db.objectStoreNames.contains('debts')) {
        const debtStore = db.createObjectStore('debts', { keyPath: 'id', autoIncrement: true });
        debtStore.createIndex('status', 'status', { unique: false });
      }

      // 5. الإعدادات
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };

    request.onsuccess = (e) => {
      dbInstance = e.target.result;
      resolve(dbInstance);
    };

    request.onerror = (e) => reject(`IndexedDB Error: ${e.target.error}`);
  });
}

export async function getStore(storeName, mode = 'readonly') {
  const db = await initDB();
  const tx = db.transaction(storeName, mode);
  return tx.objectStore(storeName);
}

export async function exportDatabaseBackup() {
  const db = await initDB();
  const backup = {
    version: DB_VERSION,
    exportDate: new Date().toISOString(),
    accounts: [],
    projects: [],
    transactions: [],
    debts: [],
    settings: []
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['accounts', 'projects', 'transactions', 'debts', 'settings'], 'readonly');

    tx.objectStore('accounts').getAll().onsuccess = (e) => backup.accounts = e.target.result;
    tx.objectStore('projects').getAll().onsuccess = (e) => backup.projects = e.target.result;
    tx.objectStore('transactions').getAll().onsuccess = (e) => backup.transactions = e.target.result;
    tx.objectStore('debts').getAll().onsuccess = (e) => backup.debts = e.target.result;
    tx.objectStore('settings').getAll().onsuccess = (e) => backup.settings = e.target.result;

    tx.oncomplete = () => resolve(JSON.stringify(backup, null, 2));
    tx.onerror = (e) => reject(e.target.error);
  });
}