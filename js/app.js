// js/app.js
import { 
  calculatePhysicalBalances, 
  calculateProjectProfits, 
  getActiveDebts, 
  getLiveFXRate, 
  setLiveFXRate, 
  settleDebt,
  recordTransaction,
  getAllAccounts,
  getAllProjects
} from './ledger.js';
import { getApiKey, setApiKey, sendToDeepSeek } from './ai.js';
import { executeAiOperations } from './executor.js';
import { exportDatabaseBackup } from './db.js';

let pendingPayload = null;
let currentTab = 'wallets'; // 'wallets' أو 'projects'

// تهيئة وتشغيل الواجهة عند فتح الصفحة
window.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  setupVoice();
  setupEvents();
  try {
    await refreshUI();
  } catch (err) {
    console.error("خطأ في التحميل الأولي:", err);
  }
});

// تحديث شامل لكافة عناصر الواجهة
export async function refreshUI() {
  try {
    const fx = await getLiveFXRate();
    const fxBtn = document.getElementById('liveFxDisplay');
    if (fxBtn) {
      fxBtn.textContent = `1$ = ${Number(fx).toLocaleString()} ل.س`;
    }

    if (currentTab === 'wallets') {
      await renderWallets();
    } else {
      await renderProjects();
    }
  } catch (err) {
    console.error("خطأ أثناء تحديث الواجهة:", err);
  }
}

// التحكم بالتبديل بين شاشتي المحافظ والمشاريع
function setupTabs() {
  const tabWallets = document.getElementById('tabWallets');
  const tabProjects = document.getElementById('tabProjects');
  const walletsSec = document.getElementById('walletsSection');
  const projectsSec = document.getElementById('projectsSection');

  if (!tabWallets || !tabProjects) return;

  tabWallets.onclick = () => {
    currentTab = 'wallets';
    tabWallets.className = 'flex-1 py-2 text-center font-bold bg-white text-indigo-700 rounded-lg shadow-sm text-sm cursor-pointer';
    tabProjects.className = 'flex-1 py-2 text-center font-bold text-gray-500 hover:text-gray-700 text-sm cursor-pointer';
    walletsSec.classList.remove('hidden');
    projectsSec.classList.add('hidden');
    renderWallets();
  };

  tabProjects.onclick = () => {
    currentTab = 'projects';
    tabProjects.className = 'flex-1 py-2 text-center font-bold bg-white text-indigo-700 rounded-lg shadow-sm text-sm cursor-pointer';
    tabWallets.className = 'flex-1 py-2 text-center font-bold text-gray-500 hover:text-gray-700 text-sm cursor-pointer';
    walletsSec.classList.add('hidden');
    projectsSec.classList.remove('hidden');
    renderProjects();
  };
}

// عرض المحافظ الواقعية الديناميكية
async function renderWallets() {
  const container = document.getElementById('walletsContainer');
  if (!container) return;
  container.innerHTML = '';

  const balances = await calculatePhysicalBalances();
  const accountKeys = Object.keys(balances);

  if (accountKeys.length === 0) {
    container.innerHTML = `
      <div class="text-center text-xs text-gray-400 py-10 bg-white rounded-xl border border-dashed border-gray-200">
        لم يتم إنشاء أي محفظة بعد.<br>تحدث مع المساعد الصوتي أو اكتب له ليضيف لك أي محفظة فوراً!
      </div>
    `;
    return;
  }

  accountKeys.forEach(name => {
    const item = balances[name];
    const isUSD = item.currency === 'USD';
    const card = document.createElement('div');
    card.className = `bg-white p-4 rounded-xl shadow-sm border-r-4 ${isUSD ? 'border-emerald-500' : 'border-blue-500'} flex justify-between items-center`;
    card.innerHTML = `
      <div>
        <div class="text-xs text-gray-500 font-bold">${isUSD ? '💵' : '📱'} ${name}</div>
        <div class="text-xl font-bold text-gray-800 mt-1" dir="ltr">
          ${item.amount.toLocaleString()} <span class="text-xs">${item.currency}</span>
        </div>
      </div>
      <button class="btn-adjust text-gray-400 hover:text-indigo-600 p-2 rounded-lg hover:bg-indigo-50 cursor-pointer" data-name="${name}" data-curr="${item.currency}">
        ✏️
      </button>
    `;
    container.appendChild(card);
  });

  container.querySelectorAll('.btn-adjust').forEach(btn => {
    btn.onclick = () => openAdjustModal(btn.dataset.name, btn.dataset.name, btn.dataset.curr);
  });
}

// عرض المشاريع والديون الديناميكية
async function renderProjects() {
  const container = document.getElementById('projectsContainer');
  const debtsContainer = document.getElementById('debtsListContainer');
  if (!container || !debtsContainer) return;

  container.innerHTML = '';
  debtsContainer.innerHTML = '';

  const profits = await calculateProjectProfits();
  const debts = await getActiveDebts();
  const projectKeys = Object.keys(profits);

  if (projectKeys.length === 0) {
    container.innerHTML = '<div class="text-center text-xs text-gray-400 py-4 bg-white rounded-xl border border-dashed border-gray-200">لا توجد مشاريع مسجلة بعد.</div>';
  } else {
    projectKeys.forEach(name => {
      const data = profits[name];
      const card = document.createElement('div');
      card.className = 'bg-white p-4 rounded-xl shadow-sm border border-gray-100';
      card.innerHTML = `
        <h4 class="font-bold text-gray-800 text-sm">${name}</h4>
        <div class="mt-2 pt-2 border-t border-gray-50 flex gap-4">
          <div>
            <span class="text-[11px] text-gray-400">الصافي (سوري):</span>
            <div class="font-bold text-sm ${data.netSYP >= 0 ? 'text-emerald-600' : 'text-red-500'}" dir="ltr">
              ${data.netSYP.toLocaleString()} ل.س
            </div>
          </div>
          <div>
            <span class="text-[11px] text-gray-400">الصافي (دولار):</span>
            <div class="font-bold text-sm ${data.netUSD >= 0 ? 'text-emerald-600' : 'text-red-500'}" dir="ltr">
              ${data.netUSD.toLocaleString()} $
            </div>
          </div>
        </div>
      `;
      container.appendChild(card);
    });
  }

  // عرض الديون والأمانات
  if (debts.length === 0) {
    debtsContainer.innerHTML = '<div class="text-center text-xs text-gray-400 py-3">لا توجد ديون أو أمانات معلقة حالياً 🎉</div>';
  } else {
    debts.forEach(d => {
      const isToPay = d.direction === 'TO_PAY';
      const item = document.createElement('div');
      item.className = `p-3 rounded-lg border flex justify-between items-center ${isToPay ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`;
      item.innerHTML = `
        <div>
          <div class="font-bold text-sm text-gray-800">${d.person}</div>
          <div class="text-xs ${isToPay ? 'text-red-600' : 'text-emerald-600'} font-bold">
            ${isToPay ? 'أمانة بذمتنا له' : 'دين لنا عليه'}: ${d.amount.toLocaleString()} ${d.currency}
          </div>
          ${d.note ? `<div class="text-[11px] text-gray-500 mt-0.5">${d.note}</div>` : ''}
        </div>
        <button class="btn-settle text-xs bg-white shadow-sm border px-2.5 py-1.5 rounded-md hover:bg-gray-50 font-bold cursor-pointer" data-id="${d.id}">
          تسوية ✅
        </button>
      `;
      debtsContainer.appendChild(item);
    });

    debtsContainer.querySelectorAll('.btn-settle').forEach(b => {
      b.onclick = async () => {
        if (confirm('هل تريد تسوية وإغلاق هذه الذمة نهائياً؟')) {
          await settleDebt(b.dataset.id, 'تسوية يدوية');
          await refreshUI();
        }
      };
    });
  }
}

// نافذة التعديل اليدوي المباشر في حال عدم توفر الذكاء
function openAdjustModal(key, name, curr) {
  const newVal = prompt(`تعديل رصيد يدوي مباشر:\n[${name}]\nأدخل الرصيد الفعلي الموجود معك الآن:`);
  if (newVal !== null && !isNaN(newVal) && newVal.trim() !== '') {
    recordTransaction({
      type: 'MANUAL_ADJUST',
      account: key,
      project: 'تعديل يدوي',
      amount: Number(newVal),
      currency: curr,
      description: 'تسوية وتعديل رصيد يدوي مباشر'
    }).then(() => refreshUI());
  }
}

// تشغيل ميزة تحويل الصوت إلى نص المدمجة
function setupVoice() {
  const micBtn = document.getElementById('btnVoice');
  const input = document.getElementById('aiInput');
  if (!micBtn || !input) return;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    micBtn.style.display = 'none';
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'ar-SA';
  recognition.continuous = false;

  micBtn.onclick = () => {
    try {
      recognition.start();
      micBtn.classList.add('text-red-500', 'animate-pulse');
    } catch (e) {
      recognition.stop();
      micBtn.classList.remove('text-red-500', 'animate-pulse');
    }
  };

  recognition.onresult = (event) => {
    const text = event.results[0][0].transcript;
    input.value = input.value ? `${input.value} ${text}` : text;
  };

  recognition.onend = () => {
    micBtn.classList.remove('text-red-500', 'animate-pulse');
  };
}

// ربط أزرار النافذة المنبثقة والإعدادات
function setupEvents() {
  const sheet = document.getElementById('aiBottomSheet');
  const fab = document.getElementById('fabAi');
  const closeSheet = document.getElementById('closeSheet');
  const sendBtn = document.getElementById('btnSendAi');
  const input = document.getElementById('aiInput');
  const decisionBox = document.getElementById('decisionBox');

  if (fab && sheet) {
    fab.onclick = () => {
      sheet.classList.remove('translate-y-full');
      if (input) input.focus();
    };
  }

  if (closeSheet && sheet) {
    closeSheet.onclick = () => {
      if (input && input.value.trim() && !confirm('هل تريد إغلاق النافذة وتجاهل النص؟')) return;
      sheet.classList.add('translate-y-full');
      if (input) input.value = '';
      if (decisionBox) decisionBox.classList.add('hidden');
      pendingPayload = null;
    };
  }

  if (sendBtn) {
    sendBtn.onclick = async () => {
      const text = input ? input.value.trim() : '';
      if (!text) return;

      sendBtn.disabled = true;
      sendBtn.textContent = 'جاري الفهم والتحليل... ⏳';

      try {
        pendingPayload = await sendToDeepSeek(text);
        document.getElementById('aiSummaryText').textContent = pendingPayload.summary_ar;
        if (decisionBox) decisionBox.classList.remove('hidden');
      } catch (err) {
        alert(err.message);
      } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = 'إرسال 🚀';
      }
    };
  }

  const btnConfirm = document.getElementById('btnConfirmAction');
  if (btnConfirm) {
    btnConfirm.onclick = async () => {
      if (!pendingPayload) return;
      try {
        await executeAiOperations(pendingPayload);
        sheet.classList.add('translate-y-full');
        if (input) input.value = '';
        if (decisionBox) decisionBox.classList.add('hidden');
        pendingPayload = null;
        await refreshUI();
      } catch (err) {
        alert('خطأ أثناء التطبيق: ' + err.message);
      }
    };
  }

  const btnReject = document.getElementById('btnRejectAction');
  if (btnReject) {
    btnReject.onclick = () => {
      if (decisionBox) decisionBox.classList.add('hidden');
      pendingPayload = null;
      if (input) input.focus();
    };
  }

  const fxBtn = document.getElementById('liveFxDisplay');
  if (fxBtn) {
    fxBtn.onclick = async () => {
      const cur = await getLiveFXRate();
      const val = prompt('أدخل سعر صرف الدولار الجديد بالليرة السورية:', cur);
      if (val && !isNaN(val)) {
        await setLiveFXRate(val);
        await refreshUI();
      }
    };
  }

  const settingsBtn = document.getElementById('btnSettings');
  if (settingsBtn) {
    settingsBtn.onclick = async () => {
      const cur = await getApiKey();
      const val = prompt('أدخل مفتاح DeepSeek API:', cur);
      if (val !== null) {
        await setApiKey(val);
        alert('تم حفظ مفتاح API بنجاح!');
      }
    };
  }

  const backupBtn = document.getElementById('btnBackup');
  if (backupBtn) {
    backupBtn.onclick = async () => {
      const json = await exportDatabaseBackup();
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `Ledger_Backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
    };
  }
}