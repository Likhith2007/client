/* =============================================
   OFFLINE AI TUTOR — APPLICATION LOGIC
   ============================================= */

// ===== BACKEND API CONFIG =====
const API_BASE = 'http://localhost:8000';
let backendOnline = false;
let modelReady = false;
let currentModel = 'gemma:2b';
let availableModels = [];

function switchModel(modelName) {
  currentModel = modelName;
  console.log('Active model switched to:', currentModel);
  // Force a status poll to immediately verify status of the new model
  if (typeof triggerPoll === 'function') triggerPoll();
}

function populateModelDropdown(models) {
  const select = document.getElementById('modelSelect');
  if (!select) return;

  // Normalize model options to compare
  const currentOptions = [...select.options].map(o => o.value);
  const needsUpdate = models.length !== currentOptions.length ||
                      !models.every(m => currentOptions.includes(m));

  if (needsUpdate) {
    const prevSelected = select.value || currentModel;
    select.innerHTML = '';

    if (models.length === 0) {
      select.innerHTML = '<option value="gemma4">Gemma 4 (8B)</option><option value="gemma:2b">Gemma 2B</option>';
      return;
    }

    models.forEach(m => {
      const option = document.createElement('option');
      option.value = m;
      
      const cleanName = m.includes('gemma4') ? 'Gemma 4 (8B)'
                      : m.includes('gemma:2b') ? 'Gemma (2B - Fast)'
                      : m.includes('llama3') ? 'Llama 3 (8B)'
                      : m;
      option.textContent = cleanName;
      select.appendChild(option);
    });

    // Restore selection
    if (models.includes(prevSelected)) {
      select.value = prevSelected;
      currentModel = prevSelected;
    } else {
      select.value = models[0];
      currentModel = models[0];
    }
  }
}

let triggerPoll = null;

// Poll backend status every 3s
function startStatusPolling() {
  const poll = async () => {
    try {
      const res = await fetch(`${API_BASE}/status`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const data = await res.json();
        backendOnline = true;
        
        const installedModels = data.models || [];
        
        // Sync dropdown options and currentModel first to ensure the active model is set correctly
        populateModelDropdown(installedModels);
        
        // The model is ready if the selected model is installed
        modelReady = installedModels.some(m => m.includes(currentModel) || currentModel.includes(m));
        
        updateModelStatusBadge(modelReady ? 'ready' : 'model_missing', currentModel, installedModels);
      }
    } catch {
      backendOnline = false;
      modelReady = false;
      updateModelStatusBadge('offline', currentModel, []);
    }
  };
  triggerPoll = poll;
  poll();
  setInterval(poll, 3000);
}

function updateModelStatusBadge(status, model, modelsList) {
  const el = document.querySelector('.topbar-status');
  if (!el) return;

  if (status === 'ready' || status === 'model_missing') {
    populateModelDropdown(modelsList || []);
  } else {
    // If offline, populate default options
    populateModelDropdown(['gemma4', 'gemma:2b']);
  }

  const dotClass = status === 'ready' ? 'green-dot'
                 : status === 'ollama_offline' ? 'red-dot'
                 : status === 'model_missing'  ? 'orange-dot'
                 : 'red-dot';

  const cleanModel = model ? (model.includes('gemma:2b') ? 'Gemma 2B' : model.includes('gemma4') ? 'Gemma 4' : model) : 'gemma4';

  const label = status === 'ready'          ? `Ready · ${cleanModel}`
              : status === 'ollama_offline'  ? 'Ollama Offline — run: ollama serve'
              : status === 'model_missing'   ? `Run: ollama pull ${model || 'gemma4'}`
              : 'Backend Offline — showing demo responses';
  el.innerHTML = `<span class="${dotClass}"></span> ${label}`;

  const offlineTitle = document.querySelector('.offline-title');
  const offlineSub   = document.querySelector('.offline-sub');
  if (offlineTitle) offlineTitle.textContent = status === 'ready' ? `${cleanModel} Ready` : 'Connecting…';
  if (offlineSub)   offlineSub.textContent   = status === 'ready'
    ? `${cleanModel} · Local · Offline`
    : 'Start backend.py + ollama serve';
}

// ===== STUDENT PROFILE =====
let studentProfile = {
  name: 'Student',
  classNum: 8,
  language: 'Assamese',
  subjects: []
};

let currentLanguage = 'Assamese';
let isTyping = false;
let currentDemoStep = 1;

// ===== PAGE NAVIGATION =====
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

  const page = document.getElementById('page-' + pageId);
  if (page) page.classList.add('active');

  // Highlight active nav link
  document.querySelectorAll('.nav-link').forEach(link => {
    if (link.getAttribute('href') === '#' + pageId ||
        link.getAttribute('onclick')?.includes("'" + pageId + "'")) {
      link.classList.add('active');
    }
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Update tutor sidebar if profile exists
  if (pageId === 'tutor') updateTutorSidebar();
}

function toggleMenu() {
  const menu = document.getElementById('mobileMenu');
  menu.classList.toggle('open');
}

// ===== PROFILE SAVE =====
function saveProfile(event) {
  event.preventDefault();

  const name = document.getElementById('studentName').value.trim();
  const classNum = parseInt(document.getElementById('studentClass').value);
  const langEl = document.querySelector('input[name="language"]:checked');
  const language = langEl ? langEl.value : 'English';
  const subjects = [...document.querySelectorAll('.subject-chip input:checked')].map(el => el.value);

  if (!name || !classNum) return;

  studentProfile = { name, classNum, language, subjects };
  currentLanguage = language;

  updateTutorSidebar();
  updateLanguageBadge();
  showPage('tutor');

  // Reset chat with personalized welcome
  clearChat();
  setTimeout(() => {
    const welcomeText = getWelcomeMessage(studentProfile);
    addBotMessage(welcomeText);
  }, 600);
}

function getWelcomeMessage(profile) {
  const gradeTier = getGradeTier(profile.classNum);
  if (profile.language === 'Assamese') {
    return `নমস্কাৰ <strong>${profile.name}</strong>! 🎓 মই তোমাৰ AI শিক্ষক। তুমি Class ${profile.classNum} ত পঢ়া শুনা কৰা বুলি জানিলোঁ। আজি কি শিকিব বিচাৰিছা? যিকোনো প্ৰশ্ন অসমীয়াত সুধিব পাৰিবা।`;
  } else if (profile.language === 'Hindi') {
    return `नमस्ते <strong>${profile.name}</strong>! 🎓 मैं आपका AI शिक्षक हूं। आप Class ${profile.classNum} के छात्र हैं। आज क्या सीखना चाहते हो? कोई भी सवाल हिंदी में पूछ सकते हो।`;
  }
  return `Hello <strong>${profile.name}</strong>! 🎓 I'm your personal AI Tutor. Since you're in Class ${profile.classNum}, I'll explain everything at the right level for you. What would you like to learn today?`;
}

function updateTutorSidebar() {
  const p = studentProfile;
  const avatarEl = document.getElementById('profileAvatar');
  const nameEl = document.getElementById('profileName');
  const metaEl = document.getElementById('profileMeta');
  if (avatarEl) avatarEl.textContent = p.name.charAt(0).toUpperCase();
  if (nameEl) nameEl.textContent = p.name;
  if (metaEl) metaEl.textContent = `Class ${p.classNum} · ${p.language}`;

  // Update suggestions based on language
  updateSuggestions();
}

function updateSuggestions() {
  const lang = studentProfile.language;
  const list = document.getElementById('suggestionsList');
  if (!list) return;

  const suggestions = {
    English: [
      { emoji: '🌿', text: 'What is photosynthesis?' },
      { emoji: '⚛️', text: "Newton's Laws of Motion" },
      { emoji: '💧', text: 'What is the water cycle?' },
      { emoji: '🌍', text: 'What is democracy?' },
      { emoji: '🔢', text: 'Explain the Pythagoras theorem' },
      { emoji: '❤️', text: 'How does the human heart work?' },
    ],
    Hindi: [
      { emoji: '🌿', text: 'प्रकाश संश्लेषण क्या है?' },
      { emoji: '⚛️', text: 'न्यूटन के नियम क्या हैं?' },
      { emoji: '💧', text: 'जल चक्र क्या है?' },
      { emoji: '☀️', text: 'सूर्य क्या है?' },
      { emoji: '🌍', text: 'पृथ्वी क्यों घूमती है?' },
      { emoji: '🔢', text: 'पाइथागोरस प्रमेय क्या है?' },
    ],
    Assamese: [
      { emoji: '☀️', text: 'সূৰ্য কি?' },
      { emoji: '🏛️', text: 'অসমৰ ৰাজধানী কি?' },
      { emoji: '🌍', text: 'পৃথিৱী কিয় ঘূৰে?' },
      { emoji: '🌿', text: 'সালোক সংশ্লেষণ কি?' },
      { emoji: '💧', text: 'জলচক্ৰ কি?' },
      { emoji: '🔢', text: 'পাইথাগোৰাছ উপপাদ্য কি?' },
    ],
  };

  const items = suggestions[lang] || suggestions.English;
  list.innerHTML = items.map(s =>
    `<button class="suggestion-btn" onclick="askQuestion('${s.text.replace(/'/g, "\\'")}')">${s.emoji} ${s.text}</button>`
  ).join('');
}

// ===== LANGUAGE SWITCH =====
function switchLanguage(lang) {
  currentLanguage = lang;
  studentProfile.language = lang;

  document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
  const map = { English: 'langEnBtn', Hindi: 'langHiBtn', Assamese: 'langAsBtn' };
  const btn = document.getElementById(map[lang]);
  if (btn) btn.classList.add('active');

  updateLanguageBadge();
  updateSuggestions();
}

function updateLanguageBadge() {
  const badge = document.getElementById('inputLangBadge');
  if (!badge) return;
  const map = { English: 'EN', Hindi: 'हि', Assamese: 'অস' };
  badge.textContent = map[currentLanguage] || 'EN';
}

// ===== GRADE TIER HELPER =====
function getGradeTier(classNum) {
  if (classNum <= 5) return 'primary';
  if (classNum <= 9) return 'middle';
  return 'high';
}

function getGradeTierLabel(classNum) {
  if (classNum <= 5) return 'Primary';
  if (classNum <= 9) return 'Middle School';
  return 'High School';
}

// ===== AI RESPONSE ENGINE =====
const aiResponses = {
  // ---- ENGLISH ----
  'photosynthesis': {
    primary: `🌱 <strong>Photosynthesis is how plants make their own food!</strong>

Plants use <strong>sunlight</strong> ☀️, <strong>water</strong> 💧 from the soil, and <strong>air</strong> 🌬️ to cook up their food.

Think of plants like tiny chefs — their "kitchen" is inside the green leaves, and sunlight is the cooking fire!

<div class="formula-box">Sunlight + Water + Air → Plant Food + Oxygen</div>

Fun fact: The oxygen we breathe comes from this process! 🌍`,

    middle: `🌿 <strong>Photosynthesis</strong> is the process by which green plants convert light energy into chemical energy stored as glucose.

<strong>Requirements:</strong>
• Carbon dioxide (CO₂) absorbed from air through tiny holes called stomata
• Water (H₂O) absorbed through roots
• Sunlight — captured by chlorophyll

<div class="formula-box">6CO₂ + 6H₂O + Sunlight → C₆H₁₂O₆ + 6O₂</div>

This reaction takes place in the <em>chloroplasts</em> of plant cells. The glucose produced is used for the plant's energy and growth, while oxygen is released as a by-product.`,

    high: `⚗️ <strong>Photosynthesis</strong> occurs in two distinct stages in the chloroplast:

<strong>1. Light-Dependent Reactions (Thylakoid membrane):</strong>
• Photosystem II absorbs photons (680nm) — water photolysis releases O₂, electrons, and H⁺
• Electron transport chain (plastoquinone, cytochrome b6f complex, plastocyanin) pumps H⁺ to create a proton gradient
• ATP synthase produces ATP via chemiosmosis
• Photosystem I (700nm) reduces NADP⁺ to NADPH

<strong>2. Calvin Cycle / Light-Independent Reactions (Stroma):</strong>
• CO₂ fixation by RuBisCO enzyme — 3 molecules CO₂ + 3 RuBP → 6 molecules 3-PGA
• Reduction: ATP + NADPH reduce 3-PGA → G3P (glyceraldehyde-3-phosphate)
• Regeneration of RuBP using ATP

<div class="formula-box">6CO₂ + 12H₂O + Light → C₆H₁₂O₆ + 6O₂ + 6H₂O</div>

Plants exhibit C3, C4 (Hatch-Slack pathway), and CAM adaptations for different climatic conditions.`
  },

  'newton': {
    primary: `🍎 <strong>Newton's Laws are rules about how things move!</strong>

<strong>Law 1 (Lazy Law):</strong> Things don't like to change! A ball sitting still stays still. A rolling ball keeps rolling — unless something stops it.

<strong>Law 2 (Push Law):</strong> The harder you push something, the faster it goes! Heavier things need more push.

<strong>Law 3 (Buddy Law):</strong> Every push has a push back! When you jump, the ground pushes you up 😊`,

    middle: `⚛️ <strong>Newton's Three Laws of Motion</strong>

<strong>First Law (Inertia):</strong> An object at rest stays at rest, and an object in motion stays in motion with the same speed and direction — unless acted upon by an unbalanced force.

<strong>Second Law:</strong> Force equals mass times acceleration.
<div class="formula-box">F = ma</div>
A heavier object requires more force to accelerate at the same rate.

<strong>Third Law (Action-Reaction):</strong> For every action, there is an equal and opposite reaction.

Example: Rocket engines expel gas backward (action) → rocket moves forward (reaction).`,

    high: `🔭 <strong>Newton's Laws of Motion — Advanced Analysis</strong>

<strong>First Law — Inertia:</strong> In an inertial reference frame, a body remains at rest or moves with constant velocity unless acted on by a net external force. Mathematically: if ΣF = 0, then dv/dt = 0.

<strong>Second Law:</strong> The net force acting on a body equals the rate of change of its momentum.
<div class="formula-box">F = dp/dt = d(mv)/dt</div>
For constant mass: F = ma. This is a vector equation — applies in each dimension independently.

<strong>Third Law:</strong> Forces occur in action-reaction pairs. If body A exerts force F_AB on body B, then B exerts force F_BA = −F_AB on A. These forces act on different bodies — they never cancel each other.

<strong>Limitations:</strong> Newton's laws break down at relativistic speeds (→ Special Relativity) and at quantum scales (→ Quantum Mechanics).`
  },

  'gravity': {
    primary: `⬇️ <strong>Gravity is what keeps us on the ground!</strong>

Gravity is like an invisible force that pulls everything down toward Earth. That's why when you throw a ball up, it always comes back down!

🌍 The Earth is very heavy, so it has very strong gravity. The Moon also has gravity, but it's weaker — that's why astronauts can jump really high there!

Fun fact: If you drop a feather and a rock at the same time in space (no air), they fall at the SAME speed! 🚀`,

    middle: `🌍 <strong>Gravity</strong> is a fundamental force of nature that attracts all objects with mass toward each other.

Newton's Law of Universal Gravitation states that every object with mass attracts every other object with mass:
<div class="formula-box">F = G × (m₁ × m₂) / r²</div>

Where G is the gravitational constant (6.674 × 10⁻¹¹ N·m²/kg²).

On Earth's surface, acceleration due to gravity (g) ≈ 9.8 m/s².

Gravity is responsible for: keeping planets in orbit, ocean tides, and the formation of stars and galaxies.`,

    high: `🔭 <strong>Gravity — Newtonian & General Relativistic Perspectives</strong>

<strong>Newtonian Gravity:</strong>
<div class="formula-box">F = Gm₁m₂/r²</div>
Field strength: g = GM/r² = 9.81 m/s² at Earth's surface.

<strong>Einstein's General Relativity (1915):</strong> Gravity is not a force but the curvature of spacetime caused by mass-energy. Described by the Einstein Field Equations:
<div class="formula-box">Gμν + Λgμν = (8πG/c⁴)Tμν</div>

<strong>Key predictions verified:</strong> Gravitational time dilation, gravitational lensing, gravitational waves (LIGO 2015), black holes, perihelion precession of Mercury.

<strong>Gravitational potential:</strong> Φ = -GM/r. Escape velocity: v_esc = √(2GM/r).`
  },

  'water cycle': {
    primary: `💧 <strong>The Water Cycle is how water travels around the Earth!</strong>

Step 1: ☀️ The sun heats up water in rivers and oceans — it turns into invisible steam (called evaporation).

Step 2: ⬆️ The steam floats up into the sky and forms clouds (condensation).

Step 3: 🌧️ When clouds get heavy, water falls back as rain or snow (precipitation).

Step 4: 🔁 The rain fills rivers and oceans again — and the cycle repeats!`,

    middle: `🌊 <strong>The Water (Hydrological) Cycle</strong>

The continuous movement of water on, above, and below Earth's surface:

<strong>1. Evaporation:</strong> Solar energy converts liquid water → water vapor. Mainly from oceans (70% of Earth's surface).

<strong>2. Transpiration:</strong> Plants release water vapor through leaves. Evaporation + Transpiration = Evapotranspiration.

<strong>3. Condensation:</strong> Water vapor cools and forms clouds (tiny water droplets or ice crystals around dust particles).

<strong>4. Precipitation:</strong> Rain, snow, sleet, or hail falls when droplets become heavy enough.

<strong>5. Collection & Infiltration:</strong> Water collects in oceans, rivers, and lakes. Some seeps into groundwater (aquifers).`,

    high: `🌍 <strong>Hydrological Cycle — Advanced Analysis</strong>

<strong>Global Water Balance:</strong> Earth holds ~1.4 billion km³ of water. 97.5% saline, 2.5% fresh.

<strong>Quantitative fluxes:</strong>
• Evaporation: ~496,000 km³/year (ocean: 425,000 km³; land: 71,000 km³)
• Precipitation: ocean 385,000 km³; land 111,000 km³
• Surface runoff: ~37,000 km³/year

<strong>Residence Times:</strong> Oceans ~3,200 years; Glaciers ~20-100k years; Groundwater ~100-10,000 years; Rivers ~2-6 months; Atmosphere ~9 days.

<strong>Climate connections:</strong> ENSO events alter precipitation patterns globally. Ocean thermohaline circulation (driven by density differences) transports heat and influences regional climate. Latent heat of vaporization (2.26 MJ/kg) makes water a major climate regulator.`
  },

  // ---- ASSAMESE ----
  'সূৰ্য': {
    primary: `☀️ <strong>সূৰ্য হৈছে আমাৰ আকাশৰ আটাইতকৈ ডাঙৰ তৰা!</strong>

সূৰ্য অতি গৰম — ইয়াৰ পৃষ্ঠত তাপমাত্ৰা প্ৰায় ৫,৫০০°C! 🌡️

সূৰ্যৰ পোহৰ পৃথিৱীত আহিবলৈ প্ৰায় ৮ মিনিট লাগে।

গছ-পাত সূৰ্যৰ পোহৰেৰে খাদ্য তৈয়াৰ কৰে। সূৰ্য নহলে পৃথিৱীত কোনো জীৱন নাথাকিলহেঁতেন! 🌱

<strong>মজাৰ কথা:</strong> সূৰ্যৰ ভিতৰত ১০ লাখতকৈও বেছি পৃথিৱী ভৰাব পাৰি! 🌍`,

    middle: `🌟 <strong>সূৰ্য</strong> হৈছে আমাৰ সৌৰজগতৰ কেন্দ্ৰত থকা এটা মধ্যম আকাৰৰ তৰা।

<strong>গুৰুত্বপূৰ্ণ তথ্য:</strong>
• ব্যাস: প্ৰায় ১৩.৯ লাখ কিলোমিটাৰ (পৃথিৱীৰ প্ৰায় ১০৯ গুণ)
• পৃথিৱীৰ পৰা দূৰত্ব: প্ৰায় ১৫ কোটি কিলোমিটাৰ
• পৃষ্ঠ তাপমাত্ৰা: ৫,৫০০°C
• কেন্দ্ৰৰ তাপমাত্ৰা: ১.৫ কোটি°C

<strong>গঠন:</strong> সূৰ্যৰ ৭৩% হাইড্ৰ'জেন আৰু ২৫% হিলিয়াম গেছেৰে তৈয়াৰ।

সূৰ্যৰ শক্তি আহে নিউক্লিয়াৰ ফিউজন প্ৰক্ৰিয়াৰ পৰা — ইয়াত হাইড্ৰ'জেন পৰমাণু একত্ৰিত হৈ হিলিয়াম তৈয়াৰ হয় আৰু বিশাল পৰিমাণৰ শক্তি নিৰ্গত হয়।`,

    high: `⭐ <strong>সূৰ্য — তাৰকা পদাৰ্থবিজ্ঞান</strong>

সূৰ্য হৈছে G2V শ্ৰেণীৰ এটা মধ্যম আকাৰৰ Main Sequence তৰা।

<strong>ভৌতিক বৈশিষ্ট্য:</strong>
• ভৰ: ১.৯৮৯ × ১০³⁰ kg (সৌৰজগতৰ মুঠ ভৰৰ ৯৯.৮৬%)
• বৰ্তমান বয়স: ৪.৬ বিলিয়ন বছৰ
• আয়ু: আৰু প্ৰায় ৫ বিলিয়ন বছৰ

<strong>শক্তি উৎপাদন — PP Chain (Proton-Proton Chain):</strong>
<div class="formula-box">4H → He-4 + 2e⁺ + 2νe + 26.7 MeV শক্তি</div>

সূৰ্যৰ গঠন: Photosphere → Chromosphere → Corona (১০-৩০ লাখ°C)

Sunspot cycles (১১ বছৰীয়া), solar flares, CME (Coronal Mass Ejection) ইত্যাদি সূৰ্যৰ চুম্বকীয় কাৰ্যকলাপৰ ফলত হয়।`
  },

  'অসমৰ ৰাজধানী': {
    primary: `🏛️ <strong>অসমৰ ৰাজধানী হৈছে দিচপুৰ!</strong>

দিচপুৰ গুৱাহাটী চহৰৰ ভিতৰতে আছে। ইয়াত অসম চৰকাৰৰ মুখ্য কাৰ্যালয় আছে।

গুৱাহাটী হৈছে অসমৰ আটাইতকৈ ডাঙৰ চহৰ আৰু উত্তৰ-পূব ভাৰতৰ প্ৰধান চহৰ।

ব্ৰহ্মপুত্ৰ নদীৰ পাৰত থকা গুৱাহাটী অতি সুন্দৰ! 🌊`,

    middle: `🗺️ <strong>অসম: ৰাজধানী আৰু ভূগোল</strong>

<strong>ৰাজধানী:</strong> দিচপুৰ (গুৱাহাটীৰ অন্তৰ্গত)
<strong>আটাইতকৈ ডাঙৰ চহৰ:</strong> গুৱাহাটী
<strong>ৰাজ্যৰ মুখ্যমন্ত্ৰীৰ কাৰ্যালয়:</strong> দিচপুৰ

অসম উত্তৰ-পূব ভাৰতৰ সৰ্ববৃহৎ ৰাজ্য। ব্ৰহ্মপুত্ৰ নদীয়ে অসমৰ মাজেদি বৈ গৈছে।

<strong>গুৰুত্বপূৰ্ণ স্থান:</strong>
• কামাখ্যা মন্দিৰ
• কাজিৰাঙা ৰাষ্ট্ৰীয় উদ্যান (UNESCO World Heritage)
• মাজুলী দ্বীপ (বিশ্বৰ সৰ্ববৃহৎ নদী দ্বীপ)`,

    high: `📚 <strong>অসম — ৰাজনৈতিক ও ভৌগোলিক বিশ্লেষণ</strong>

<strong>ৰাজধানী:</strong> দিচপুৰ, গুৱাহাটী (প্ৰাক্তন ৰাজধানী: শ্বিলং, ১৯৭২ চনলৈকে)

<strong>ক্ষেত্ৰফল:</strong> ৭৮,৪৩৮ বৰ্গ কিলোমিটাৰ
<strong>জনসংখ্যা:</strong> প্ৰায় ৩.৫ কোটি (২০১১ আদমশুমাৰি)

<strong>ঐতিহাসিক পটভূমি:</strong> অসম ১৯৪৭ চনত ভাৰতৰ অংশ হয়। অসম চুক্তি (১৯৮৫) বাহ্যিক অনুপ্ৰৱেশৰ বিৰুদ্ধে স্বাক্ষৰিত হৈছিল।

<strong>অৰ্থনীতি:</strong> চাহ উৎপাদনত অসম বিশ্বত দ্বিতীয় স্থানত (ভাৰতৰ ৫৫% চাহ অসমত উৎপাদিত)। পেট্ৰ'লিয়াম, কৃষি, পৰ্যটন প্ৰধান খণ্ড।`
  },

  'পৃথিৱী ঘূৰে': {
    primary: `🌍 <strong>পৃথিৱী ঘূৰে কিয়?</strong>

পৃথিৱী এটা বিশাল লাটুৰ দৰে ঘূৰে! 🌀

বহুত বহুত বছৰ আগেয়ে যেতিয়া পৃথিৱী তৈয়াৰ হৈছিল, তেতিয়াৰে পৰা ই ঘূৰিছে।

পৃথিৱী ঘূৰাৰ কাৰণেই দিন আৰু ৰাতি হয়! 🌅
• যি অংশ সূৰ্যৰ ফালে থাকে — তাত দিন
• যি অংশ সূৰ্যৰ পৰা আঁতৰে থাকে — তাত ৰাতি`,

    middle: `🌐 <strong>পৃথিৱীৰ আৱৰ্তন (Rotation)</strong>

পৃথিৱী নিজৰ অক্ষত (Axis) ঘূৰে — এই প্ৰক্ৰিয়াক আৱৰ্তন বোলে।

<strong>আৱৰ্তনৰ তথ্য:</strong>
• সময়: ২৩ ঘণ্টা ৫৬ মিনিট ৪ ছেকেণ্ড (Sidereal Day)
• সূৰ্য দিৱস: ২৪ ঘণ্টা
• দিক: পশ্চিমৰ পৰা পূবলৈ (Anti-clockwise)

<strong>আৱৰ্তনৰ কাৰণ:</strong> সৌৰজগত গঠনৰ সময়ত গেছ আৰু ধূলিকণাৰ ঘূৰণৰ গতিশক্তি (Angular Momentum) সংৰক্ষিত হৈ আছে। মহাকাশত ঘৰ্ষণ নাই, সেয়ে ঘূৰণ বন্ধ নহয়।

<strong>প্ৰভাৱ:</strong> দিন-ৰাতি, Coriolis Effect, পৃথিৱীৰ মেৰু অংচলত চেপেটা হোৱা।`,

    high: `🌌 <strong>পৃথিৱীৰ আৱৰ্তন — উন্নত বিশ্লেষণ</strong>

<strong>Angular Momentum Conservation:</strong> পৃথিৱীৰ আৱৰ্তন আৰম্ভ হৈছিল Solar Nebula Collapse-ৰ সময়ত। Angular Momentum (L = Iω) সংৰক্ষণৰ নীতি অনুসৰি ইয়াৰ ঘূৰণ অব্যাহত আছে।

<strong>Axial Tilt:</strong> পৃথিৱীৰ অক্ষ ২৩.৫° হেলনীয়া — এইটোৱেই ঋতু পৰিৱৰ্তনৰ কাৰণ।

<strong>Precession of Equinoxes:</strong> পৃথিৱীৰ অক্ষ এটা শঙ্কুৰ দৰে গতি কৰে — সম্পূৰ্ণ এটা চক্ৰ সম্পূৰ্ণ হ'বলৈ ২৫,৭৭২ বছৰ লাগে (Milankovitch Cycles)।

<strong>Tidal Locking & Slowing:</strong> চন্দ্ৰৰ মাধ্যাকৰ্ষণৰ ফলত পৃথিৱীৰ আৱৰ্তন প্ৰতি শতাব্দীত ১.৪ millisecond হ্ৰাস পাইছে।

<div class="formula-box">τ = dL/dt = r × F (Torque)</div>`
  },

  // ---- HINDI ----
  'प्रकाश संश्लेषण': {
    primary: `🌿 <strong>प्रकाश संश्लेषण यानी पौधों का खाना बनाना!</strong>

पौधे बहुत चालाक होते हैं — वो अपना खाना खुद बनाते हैं! 🍃

उन्हें चाहिए:
• ☀️ धूप
• 💧 पानी (जड़ों से)
• 🌬️ हवा (CO₂)

<div class="formula-box">धूप + पानी + हवा → खाना + ऑक्सीजन</div>

मज़ेदार बात: पौधे जो ऑक्सीजन छोड़ते हैं, वही हम सांस लेते हैं! 🌍`,

    middle: `🌱 <strong>प्रकाश संश्लेषण (Photosynthesis)</strong>

यह वह प्रक्रिया है जिसमें पौधे सूर्य की रोशनी की मदद से खाना बनाते हैं।

<strong>आवश्यक चीज़ें:</strong>
• कार्बन डाइऑक्साइड (CO₂) — हवा से
• पानी (H₂O) — जड़ों से
• सूर्य का प्रकाश — क्लोरोफिल द्वारा अवशोषित

<div class="formula-box">6CO₂ + 6H₂O + प्रकाश → C₆H₁₂O₆ + 6O₂</div>

यह प्रक्रिया पत्तियों में मौजूद <em>क्लोरोप्लास्ट</em> में होती है।
क्लोरोफिल हरे रंग का होता है इसलिए पत्तियाँ हरी दिखती हैं।`,

    high: `⚗️ <strong>प्रकाश संश्लेषण — उन्नत जैव रसायन</strong>

प्रकाश संश्लेषण दो चरणों में होता है:

<strong>1. प्रकाश अभिक्रियाएँ (Thylakoid Membrane):</strong>
• फोटोसिस्टम II: जल का प्रकाश-अपघटन → O₂ + H⁺ + e⁻
• इलेक्ट्रॉन परिवहन श्रृंखला → ATP संश्लेषण
• फोटोसिस्टम I: NADP⁺ → NADPH

<strong>2. केल्विन चक्र (Dark Reactions, Stroma):</strong>
• CO₂ स्थिरीकरण: RuBisCO एंजाइम → 3-PGA
• G3P निर्माण (ATP + NADPH उपयोग)
• RuBP का पुनर्जनन

<div class="formula-box">6CO₂ + 12H₂O → C₆H₁₂O₆ + 6O₂ + 6H₂O</div>

C3, C4 (मक्का, गन्ना) और CAM पौधों में प्रकाश संश्लेषण के विभिन्न अनुकूलन पाए जाते हैं।`
  },

  'french revolution': {
    primary: `🇫🇷 <strong>French Revolution was when the people of France fought for freedom!</strong>

A long time ago (1789), the people in France were very unhappy. The king had lots of money, but ordinary people were poor and hungry.

So the people stood up and said "Enough!" They wanted freedom and equal rights for everyone.

The motto was: <strong>Liberty, Equality, Fraternity!</strong> ⚖️

This changed France forever — and inspired many other countries too!`,

    middle: `⚔️ <strong>The French Revolution (1789–1799)</strong>

<strong>Causes:</strong>
• Financial crisis — France was bankrupt after wars
• Social inequality — Three Estates system (Clergy, Nobility, Commoners)
• Enlightenment ideas — Liberty, equality, democracy
• Food shortage and high bread prices

<strong>Key Events:</strong>
• 1789: Storming of the Bastille (July 14) — symbolic start
• Declaration of the Rights of Man
• Execution of King Louis XVI and Marie Antoinette
• Reign of Terror under Robespierre
• Rise of Napoleon Bonaparte

<strong>Impact:</strong> End of feudalism, spread of democratic ideals worldwide.`,

    high: `📜 <strong>French Revolution — Historical Analysis</strong>

<strong>Structural Causes:</strong> The Ancien Régime's estates system concentrated 97% of land wealth with 3% of population. Enlightenment philosophers (Voltaire, Rousseau, Montesquieu) provided ideological foundations for social contract theory.

<strong>Fiscal Crisis:</strong> France's debt (particularly from American Revolutionary War support) consumed 50% of royal revenue by 1788. Tax exemptions for privileged classes made reform impossible within the system.

<strong>Phases:</strong>
1. Constitutional Monarchy (1789–1792): National Assembly, Declaration of Rights
2. First Republic & Reign of Terror (1792–1794): Committee of Public Safety, 16,594+ executions
3. Thermidorian Reaction (1794–1799): Moderate reaction
4. Napoleon's coup (18 Brumaire, 1799)

<strong>Historiographical debates:</strong> Marxist interpretation (class struggle) vs. Revisionist approach (political contingency). Long-term impact: spread of nationalism, republicanism, and codified law (Napoleonic Code).`
  },

  'heart': {
    primary: `❤️ <strong>Your heart is like a pump for your body!</strong>

Your heart beats about <strong>100,000 times every day</strong> — never stopping, never resting!

It pumps blood all around your body. Blood carries:
• 🟥 Oxygen from your lungs
• 🍽️ Food nutrients from your stomach

Feel your chest — that's your heart working! Put your hand over your heart... thump thump thump! 💓`,

    middle: `❤️ <strong>The Human Heart</strong>

The heart is a muscular organ that pumps blood through the circulatory system.

<strong>Structure:</strong>
• 4 chambers: Right Atrium, Right Ventricle, Left Atrium, Left Ventricle
• The septum divides left and right sides

<strong>Blood Flow:</strong>
Right side → Lungs (for oxygen) → Left side → Body

<strong>Two circuits:</strong>
• Pulmonary circulation: Heart ↔ Lungs
• Systemic circulation: Heart ↔ Body

<strong>Key facts:</strong>
• Beats ~72 times/minute at rest
• Pumps ~5 litres of blood per minute
• Valves (mitral, tricuspid, aortic, pulmonary) prevent backflow`,

    high: `🫀 <strong>Cardiac Physiology — Advanced</strong>

<strong>Cardiac Cycle:</strong>
• Systole (contraction): Ventricular pressure > aortic pressure → blood ejected
• Diastole (relaxation): Heart fills with blood
• Stroke volume: ~70 mL; Cardiac output: HR × SV ≈ 5 L/min

<strong>Electrical Conduction System:</strong>
SA Node (natural pacemaker, 60-100 bpm) → AV Node (delays signal ~0.1s) → Bundle of His → Purkinje fibers

<strong>ECG Waves:</strong> P wave (atrial depolarization) → QRS complex (ventricular depolarization) → T wave (ventricular repolarization)

<strong>Frank-Starling Law:</strong> Stroke volume increases proportionally to end-diastolic volume (preload).

<strong>Regulation:</strong> Sympathetic NS (↑HR, ↑contractility) via norepinephrine; Parasympathetic (↓HR) via acetylcholine on muscarinic receptors.`
  }
};

function findResponse(question) {
  const q = question.toLowerCase();

  // Check for specific topics
  const topicMap = [
    { keys: ['photosynthesis', 'photo synthesis', 'সালোক', 'प्रकाश संश्लेषण'], topic: 'photosynthesis' },
    { keys: ['newton', 'न्यूटन', 'নিউটন'], topic: 'newton' },
    { keys: ['gravity', 'gravitational', 'गुरुत्वाकर्षण', 'মাধ্যাকৰ্ষণ'], topic: 'gravity' },
    { keys: ['water cycle', 'जल चक्र', 'জলচক্ৰ', 'hydrological'], topic: 'water cycle' },
    { keys: ['সূৰ্য কি', 'সূৰ্য হ', 'সূৰ্যৰ'], topic: 'সূৰ্য' },
    { keys: ['অসমৰ ৰাজধানী', 'dispur', 'দিচপুৰ'], topic: 'অসমৰ ৰাজধানী' },
    { keys: ['পৃথিৱী কিয় ঘূৰে', 'পৃথিৱী ঘূৰে'], topic: 'পৃথিৱী ঘূৰে' },
    { keys: ['french revolution', 'ফৰাচী বিপ্লৱ', 'फ्रांसीसी क्रांति'], topic: 'french revolution' },
    { keys: ['heart', 'cardiac', 'হৃদয়', 'हृदय', 'হাৰ্ট'], topic: 'heart' },
  ];

  for (const { keys, topic } of topicMap) {
    if (keys.some(k => q.includes(k.toLowerCase()))) {
      return topic;
    }
  }
  return null;
}

function generateGenericResponse(question, classNum, language) {
  const tier = getGradeTier(classNum);

  if (language === 'Assamese') {
    return `📚 তোমাৰ প্ৰশ্নটো হৈছে: <strong>"${question}"</strong>

ই এটা অতি ভাল প্ৰশ্ন! <strong>Class ${classNum}</strong> ৰ বাবে ব্যাখ্যা কৰোঁ:

এই বিষয়ত বিস্তাৰিত উত্তৰ দিবলৈ Gemma 4 স্থানীয় মডেলটো ব্যৱহাৰ কৰা হ'ব। মডেলটো সম্পূৰ্ণ অফলাইনত চলে, গতিকে কোনো ইণ্টাৰনেটৰ প্ৰয়োজন নাই।

<strong>তোমাৰ স্তৰ অনুযায়ী:</strong> ${tier === 'primary' ? 'সহজ ভাষাত আৰু ৰঙীন উদাহৰণেৰে বুজাব।' : tier === 'middle' ? 'মূল তথ্য আৰু সূত্ৰসহ বুজাব।' : 'বৈজ্ঞানিক বিশ্লেষণসহ বিস্তাৰিত বুজাব।'}

💡 উপৰৰ সাজেষ্ট কৰা প্ৰশ্নসমূহ চেষ্টা কৰক!`;
  }

  if (language === 'Hindi') {
    return `📚 आपका प्रश्न है: <strong>"${question}"</strong>

यह एक बहुत अच्छा सवाल है! <strong>Class ${classNum}</strong> के स्तर पर व्याख्या करते हैं:

वास्तविक deployment में, Gemma 4 मॉडल आपके डिवाइस पर locally चलेगा और इंटरनेट की आवश्यकता नहीं होगी।

<strong>आपके स्तर के अनुसार:</strong> ${tier === 'primary' ? 'सरल भाषा और मज़ेदार उदाहरणों के साथ।' : tier === 'middle' ? 'मुख्य तथ्यों और सूत्रों के साथ।' : 'विस्तृत वैज्ञानिक विश्लेषण के साथ।'}

💡 ऊपर दिए गए suggested questions को आज़माएं!`;
  }

  return `📚 Great question: <strong>"${question}"</strong>

This is being processed by the <strong>local Gemma 4 model</strong> — no internet needed!

For a <strong>Class ${classNum}</strong> student, the explanation would be at the <em>${getGradeTierLabel(classNum)}</em> level.

${tier === 'primary' ? '🌱 The response would use simple language, fun analogies, and emojis to make learning enjoyable!' : 
  tier === 'middle' ? '📚 The response would include core concepts, key formulas, and clear examples.' : 
  '🎓 The response would provide detailed scientific analysis with advanced concepts and equations.'}

💡 <strong>Tip:</strong> Try the suggested questions in the sidebar for full demo responses!`;
}

// ===== CHAT FUNCTIONS =====
function askQuestion(question) {
  const input = document.getElementById('chatInput');
  if (input) {
    input.value = question;
    autoResize(input);
  }
  sendMessage();
}

function handleKey(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 160) + 'px';
}

async function sendMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text || isTyping) return;

  addUserMessage(text);
  input.value = '';
  input.style.height = 'auto';

  const followUp = document.getElementById('followUpSuggestions');
  if (followUp) followUp.style.display = 'none';

  isTyping = true;
  document.getElementById('sendBtn').disabled = true;

  // ── Real Gemma 4 streaming via SSE ──────────────────
  if (backendOnline && modelReady) {
    showTypingIndicator();
    try {
      const res = await fetch(`${API_BASE}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question:     text,
          grade:        studentProfile.classNum,
          language:     currentLanguage,
          student_name: studentProfile.name,
          model:        currentModel,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }

      // Create the AI bubble immediately (empty) so tokens stream into it
      removeTypingIndicator();
      const bubble = createStreamingBubble();
      const textEl  = bubble.querySelector('.bubble-text');

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = '';
      let   fullText = '';
      let   metaInfo = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const obj = JSON.parse(line.slice(6));

            if (obj.meta) {
              metaInfo = obj.meta;
              // Update bubble label with real model info
              const metaEl = bubble.querySelector('.bubble-meta');
              if (metaEl && metaInfo.grade_tier) {
                const tierLabel = { primary: 'Primary', middle: 'Middle School', high: 'High School' };
                const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
                const cleanModel = metaInfo.model.includes('gemma:2b') ? 'Gemma 2B' 
                                 : metaInfo.model.includes('gemma4') ? 'Gemma 4' 
                                 : metaInfo.model;
                metaEl.textContent = `🤖 ${cleanModel} · ${tierLabel[metaInfo.grade_tier] || ''} · ${time}`;
              }
              continue;
            }

            if (obj.token) {
              fullText += obj.token;
              // Render markdown-lite in real time
              textEl.innerHTML = renderMarkdown(fullText) + '<span class="cursor-blink">▋</span>';
              scrollToBottom();
            }

            if (obj.done) {
              // Remove blinking cursor, finalize
              textEl.innerHTML = renderMarkdown(fullText);
              showFollowUpSuggestions(buildFollowUps(text, currentLanguage));
            }
          } catch { /* skip malformed SSE line */ }
        }
      }

      isTyping = false;
      document.getElementById('sendBtn').disabled = false;
      return;

    } catch (e) {
      removeTypingIndicator();
      console.warn('Streaming failed:', e.message);
      // Show error then fall through to demo
      addBotMessage(`⚠️ Model error: <em>${e.message}</em><br/>Showing demo response instead.`);
    }
  }

  // ── Fallback: built-in demo responses ──────────────
  showTypingIndicator();
  const delay = 900 + Math.random() * 500;
  setTimeout(() => {
    removeTypingIndicator();
    const response = generateResponse(text);
    addBotMessage(response.text);
    showFollowUpSuggestions(response.followUps);
    isTyping = false;
    document.getElementById('sendBtn').disabled = false;
  }, delay);
}

// Create a streaming bubble with empty content
function createStreamingBubble() {
  const container = document.getElementById('chatMessages');
  removeWelcome();
  const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const div = document.createElement('div');
  div.className = 'chat-bubble ai streaming-bubble';
  div.innerHTML = `
    <div class="bubble-avatar ai-av">AI</div>
    <div class="bubble-content">
      <div class="bubble-meta">🤖 Gemma 4 · ${time}</div>
      <div class="bubble-text"></div>
    </div>
  `;
  container.appendChild(div);
  scrollToBottom();
  return div;
}

// Lightweight real-time markdown renderer
function renderMarkdown(raw) {
  let lines = raw.split('\n');
  let out   = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Escape HTML
    line = line
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Inline: bold, italic, code
    line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    line = line.replace(/__(.+?)__/g,     '<strong>$1</strong>');
    line = line.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    line = line.replace(/`([^`]+)`/g,
      '<code style="background:rgba(59,130,246,0.15);padding:2px 6px;border-radius:4px;font-family:monospace;font-size:0.88em;">$1</code>');

    // Headings ### / ##
    if (/^### (.+)/.test(line)) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h4 style="color:var(--blue-400);margin:12px 0 4px;font-size:1rem;">${line.replace(/^### /, '')}</h4>`);
      continue;
    }
    if (/^## (.+)/.test(line)) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h3 style="color:var(--text-primary);margin:14px 0 6px;font-size:1.05rem;">${line.replace(/^## /, '')}</h3>`);
      continue;
    }

    // Bullet points: - or * at start
    if (/^[\-\*] (.+)/.test(line)) {
      if (!inList) { out.push('<ul style="margin:6px 0 6px 16px;padding:0;">'); inList = true; }
      out.push(`<li style="margin:3px 0;">${line.replace(/^[\-\*] /, '')}</li>`);
      continue;
    }

    // Numbered list: 1. 2. etc.
    if (/^\d+\. (.+)/.test(line)) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<div style="margin:3px 0;"><strong style="color:var(--blue-400);">${line.match(/^\d+/)[0]}.</strong> ${line.replace(/^\d+\. /, '')}</div>`);
      continue;
    }

    // Close list before blank/normal lines
    if (inList && line.trim() === '') {
      out.push('</ul>');
      inList = false;
    }

    // Blank line → paragraph break
    if (line.trim() === '') {
      out.push('<br/>');
      continue;
    }

    out.push(`<span>${line}</span><br/>`);
  }

  if (inList) out.push('</ul>');
  return out.join('');
}



// Format plain-text model output into nice HTML
function formatModelResponse(text) {
  // Escape HTML entities first
  let html = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Bold **text** or __text__
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');

  // Italic *text*
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Chemical/math formulas in backticks → formula box
  html = html.replace(/`([^`]+)`/g, '<div class="formula-box">$1</div>');

  // Numbered or bulleted lines → keep as paragraphs
  // Wrap line-breaks in paragraphs
  html = html.split(/\n{2,}/).map(para => `<p>${para.replace(/\n/g, '<br/>')}</p>`).join('');

  return html;
}

// Build follow-up questions based on the detected topic
function buildFollowUps(question, language) {
  const topic = findResponse(question);
  const followUpMap = {
    photosynthesis: language === 'Assamese'
      ? ["ক্লোৰোফিল কি?", "উদ্ভিদে কেনেকৈ উশাহ লয়?"]
      : language === 'Hindi'
      ? ["क्लोरोफिल क्या है?", "पौधे कैसे सांस लेते हैं?"]
      : ["What is chlorophyll?", "How do plants breathe?", "What is cellular respiration?"],
    newton: language === 'Assamese'
      ? ["ঘৰ্ষণ কি?", "কেন্দ্ৰমুখী বল কি?"]
      : language === 'Hindi'
      ? ["घर्षण क्या है?", "गुरुत्वाकर्षण क्या है?"]
      : ["What is friction?", "What is momentum?", "Explain centripetal force"],
    "\u09b8\u09c2\u09f0\u09cd\u09af": ["\u09b8\u09c2\u09f0\u09cd\u09af\u09f0 \u09aa\u09cb\u09b9\u09f0 \u0986\u09b9\u09bf\u09ac\u09b2\u09c8 \u0995\u09bf\u09ae\u09be\u09a8 \u09b8\u09ae\u09af\u09bc \u09b2\u09be\u0997\u09c7?", "\u09b8\u09cc\u09f0\u099c\u0997\u09a4\u09a4 \u0995\u09bf\u09ae\u09be\u09a8 \u0997\u09cd\u09f0\u09b9 \u0986\u099b\u09c7?"],
    "\u0985\u09b8\u09ae\u09f0 \u09f0\u09be\u099c\u09a7\u09be\u09a8\u09c0": ["\u0985\u09b8\u09ae\u09f0 \u0986\u099f\u09be\u0987\u09a4\u0995\u09c8 \u09a1\u09be\u0999\u09f0 \u099a\u09b9\u09f0 \u0995\u09bf?", "\u0995\u09be\u099c\u09bf\u09f0\u09be\u0999\u09be \u0995\u09c7\u09a8\u09c7\u0995\u09c1\u09f1\u09be \u09a0\u09be\u0987?"],
  };
  return followUpMap[topic] || [];
}

function generateResponse(question) {
  const classNum = studentProfile.classNum;
  const language = currentLanguage;
  const tier = getGradeTier(classNum);

  const topic = findResponse(question);

  let text;
  let followUps = [];

  if (topic && aiResponses[topic]) {
    text = aiResponses[topic][tier] || aiResponses[topic].middle;

    // Generate follow-up suggestions based on topic
    const followUpMap = {
      photosynthesis: ['What is chlorophyll?', 'How do plants breathe?', 'What is respiration?'],
      newton: ['What is friction?', 'What is momentum?', 'Explain centripetal force'],
      gravity: ['What is escape velocity?', 'How do satellites orbit?', 'What is a black hole?'],
      'water cycle': ['What causes rain?', 'What are clouds made of?', 'What is drought?'],
      'সূৰ্য': ['সূৰ্যৰ পোহৰ আহিবলৈ কিমান সময় লাগে?', 'সৌৰজগতত কিমান গ্ৰহ আছে?', 'চন্দ্ৰ কি?'],
      'অসমৰ ৰাজধানী': ['অসমৰ আটাইতকৈ ডাঙৰ চহৰ কি?', 'ব্ৰহ্মপুত্ৰ নদী কোথায়?', 'কাজিৰাঙা কেনেকুৱা ঠাই?'],
      'পৃথিৱী ঘূৰে': ['পৃথিৱীৰ কিমান উপগ্ৰহ আছে?', 'ঋতু কিয় পৰিৱৰ্তন হয়?', 'সূৰ্যগ্ৰহণ কেনেকৈ হয়?'],
      'french revolution': ['What was the Reign of Terror?', 'Who was Napoleon Bonaparte?', 'What is democracy?'],
      heart: ['What is blood pressure?', 'How do lungs work?', 'What is the circulatory system?'],
    };
    followUps = followUpMap[topic] || [];
  } else {
    text = generateGenericResponse(question, classNum, language);
    followUps = [];
  }

  return { text, followUps };
}

function addUserMessage(text) {
  const container = document.getElementById('chatMessages');
  removeWelcome();

  const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const name = studentProfile.name.split(' ')[0] || 'You';
  const initial = name.charAt(0).toUpperCase();

  const div = document.createElement('div');
  div.className = 'chat-bubble user';
  div.innerHTML = `
    <div class="bubble-avatar user-av">${initial}</div>
    <div class="bubble-content">
      <div class="bubble-meta">${name} · ${time}</div>
      <div class="bubble-text">${escapeHtml(text)}</div>
    </div>
  `;
  container.appendChild(div);
  scrollToBottom();
}

function addBotMessage(html, responseMs) {
  const container = document.getElementById('chatMessages');
  removeWelcome();

  const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const tier = getGradeTierLabel(studentProfile.classNum);
  const source = (backendOnline && modelReady) ? '🤖 Local Gemma' : '📚 Demo';
  const timing = responseMs ? ` · ⚡${(responseMs/1000).toFixed(1)}s` : '';

  const div = document.createElement('div');
  div.className = 'chat-bubble ai';
  div.innerHTML = `
    <div class="bubble-avatar ai-av">AI</div>
    <div class="bubble-content">
      <div class="bubble-meta">${source} · ${tier} · ${time}${timing}</div>
      <div class="bubble-text">${html}</div>
    </div>
  `;
  container.appendChild(div);
  scrollToBottom();
}

function showTypingIndicator() {
  const container = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = 'chat-bubble ai';
  div.id = 'typingIndicator';
  div.innerHTML = `
    <div class="bubble-avatar ai-av">AI</div>
    <div class="bubble-content">
      <div class="bubble-text typing-indicator">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    </div>
  `;
  container.appendChild(div);
  scrollToBottom();
}

function removeTypingIndicator() {
  const el = document.getElementById('typingIndicator');
  if (el) el.remove();
}

function showFollowUpSuggestions(followUps) {
  const container = document.getElementById('followUpSuggestions');
  if (!container || !followUps.length) return;

  container.innerHTML = followUps.map(q =>
    `<span class="follow-up-chip" onclick="askQuestion('${q.replace(/'/g, "\\'")}')">${q}</span>`
  ).join('');
  container.style.display = 'flex';
}

function removeWelcome() {
  const w = document.querySelector('.welcome-message');
  if (w) w.remove();
}

function clearChat() {
  const container = document.getElementById('chatMessages');
  container.innerHTML = `
    <div class="welcome-message">
      <div class="welcome-icon">🎓</div>
      <h3>Namaste! I'm your AI Tutor</h3>
      <p>I can answer questions in English, Hindi, or Assamese. My explanations are tailored to your grade level. What would you like to learn today?</p>
      <div class="welcome-chips">
        <span class="welcome-chip" onclick="askQuestion('What is photosynthesis?')">🌿 Photosynthesis</span>
        <span class="welcome-chip" onclick="askQuestion('সূৰ্য কি?')">☀️ সূৰ্য কি?</span>
        <span class="welcome-chip" onclick="askQuestion('What is gravity?')">⬇️ Gravity</span>
      </div>
    </div>
  `;
  const followUp = document.getElementById('followUpSuggestions');
  if (followUp) { followUp.innerHTML = ''; followUp.style.display = 'none'; }
}

function scrollToBottom() {
  const container = document.getElementById('chatMessages');
  setTimeout(() => { container.scrollTop = container.scrollHeight; }, 50);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ===== GRADE DEMO TABS =====
function switchGradeTab(level) {
  document.querySelectorAll('.grade-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.grade-answer').forEach(a => a.classList.add('hidden'));

  const tabMap = { primary: 0, middle: 1, high: 2 };
  const tabs = document.querySelectorAll('.grade-tab');
  if (tabs[tabMap[level]]) tabs[tabMap[level]].classList.add('active');

  const answerMap = { primary: 'gradePrimary', middle: 'gradeMiddle', high: 'gradeHigh' };
  const el = document.getElementById(answerMap[level]);
  if (el) el.classList.remove('hidden');
}

// ===== DEMO FLOW =====
function nextDemoStep(step) {
  // Hide all steps
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById('demoStep' + i);
    if (el) el.classList.remove('active');
    const dot = document.getElementById('dot' + i);
    if (dot) dot.classList.remove('active');
  }

  // Show current step
  const current = document.getElementById('demoStep' + step);
  if (current) current.classList.add('active');
  const dot = document.getElementById('dot' + step);
  if (dot) dot.classList.add('active');

  currentDemoStep = step;
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  showPage('home');
  updateLanguageBadge();
  startStatusPolling();   // ← connect to backend

  // Navbar scroll effect
  window.addEventListener('scroll', () => {
    const nav = document.getElementById('navbar');
    if (!nav) return;
    if (window.scrollY > 20) {
      nav.style.background = 'rgba(10,14,26,0.97)';
    } else {
      nav.style.background = 'rgba(10,14,26,0.85)';
    }
  });

  // Init demo
  nextDemoStep(1);

  // Subject chip interactive style
  document.querySelectorAll('.subject-chip').forEach(chip => {
    chip.addEventListener('change', () => {
      // Already handled via :has() CSS
    });
  });
});
