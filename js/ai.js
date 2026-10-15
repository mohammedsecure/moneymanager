// js/ai.js
import { getLiveFXRate, calculatePhysicalBalances, getActiveDebts, getAllProjects } from './ledger.js';
import { getStore } from './db.js';

export async function getApiKey() {
  const store = await getStore('settings', 'readonly');
  return new Promise((resolve) => {
    const req = store.get('deepseek_api_key');
    req.onsuccess = () => resolve(req.result ? req.result.value : '');
    req.onerror = () => resolve('');
  });
}

export async function setApiKey(key) {
  const store = await getStore('settings', 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.put({ key: 'deepseek_api_key', value: key.trim() });
    req.onsuccess = () => resolve(true);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function buildSystemPrompt() {
  const currentFx = await getLiveFXRate();
  const balances = await calculatePhysicalBalances();
  const debts = await getActiveDebts();
  const existingProjects = await getAllProjects();

  return `أنت المحاسب الذكي والمدير المالي الشخصي. نظامك يعمل بنظام "الورقة البيضاء المطلقة" بدون أي كيانات مسبقة مجبر عليها.

المعطيات الحالية المسجلة حتى اللحظة:
- سعر الصرف المعتمد: 1$ = ${currentFx} ل.س
- المحافظ الواقعية المتوفرة حالياً وأرصدتها:
${JSON.stringify(balances, null, 2)}
- المشاريع المسجلة حالياً:
${JSON.stringify(existingProjects.map(p => p.name), null, 2)}
- الديون والذمم والأمانات المعلقة حالياً (مع الـ id):
${JSON.stringify(debts, null, 2)}

قواعد العمل المحاسبي الذكي:
1. مرونة مطلقة: يمكنك استخدام أي اسم محفظة واقعية يذكرها المستخدم (مثل: "كاش دولار", "كاش سوري", "شام كاش", "Wish Money", إلخ). وإذا ذكر محفظة جديدة أو مشروعاً جديداً، اعتمد الاسم فوراً دون أي تردد.
2. التمييز الدقيق في العمليات المركبة (مثل وساطة الشحن والتجارة):
   - إذا استلم المستخدم مبلغاً لصالح شخص (مثل العطار 500$):
     * هذا دخل نقدي للمحفظة الواقعية (INCOME في المحفظة المعنية).
     * أمانة للشخص (DEBT باتجاه TO_PAY للشخص).
   - إذا تم صرف أجور شحن (100$ مثلاً):
     * يسجل كمصروف فعلي من المحفظة (EXPENSE).
     * وينقص من أمانة الشخص أو يحسب عليه.
   - المربح الصافي للمستخدم (50$ مثلاً):
     * يسجل كإيراد صافي للمستخدم تحت مشروع "أرباح الوساطة والشحن" أو "المحفظة الشخصية".
3. احتساب سعر الصرف: إذا صرّح المستخدم بسعر صرف خاص، احسبه واكتبه في "fx_rate_used".
4. تسوية الذمم (SETTLE_DEBT): عند سداد أو مسامحة أي دين سابق، ابحث عن الـ id المقابل له في قائمة الديون وأرسل أمر SETTLE_DEBT.
5. الرد حصراً بصيغة JSON نظيفة وصحيحة تماماً دون أي كلام إضافي خارجها.

هيكل الـ JSON المطلوب إرجاعه:
{
  "summary_ar": "شرح واضح ومختصر جداً بالعربية يوضح تفصيل المعاملة",
  "fx_rate_used": ${currentFx},
  "operations": [
    {
      "action": "TRANSACTION", // أو "DEBT" أو "SETTLE_DEBT"
      "type": "INCOME",        // "INCOME" أو "EXPENSE" أو "MANUAL_ADJUST"
      "account": "كاش دولار",  // اسم الوعاء الواقعي الذي دخل/خرج منه المال
      "project": "وساطة شحن العطار", // اسم المشروع
      "amount": 500,
      "currency": "USD",       // "USD" أو "SYP"
      "description": "استلام أمانة شحن من العطار"
    },
    {
      "action": "DEBT",
      "person": "العطار",
      "amount": 350,
      "currency": "USD",
      "direction": "TO_PAY",
      "project": "وساطة شحن العطار",
      "note": "أمانة متبقية للعطار بعد خصم 100 شحن و50 عمولة"
    }
  ]
}`;
}

export async function sendToDeepSeek(userMessage) {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('لم يتم تعيين مفتاح DeepSeek API بعد.');

  const systemPrompt = await buildSystemPrompt();

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `خطأ في الاتصال: ${response.status}`);
  }

  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}