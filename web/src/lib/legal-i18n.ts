/**
 * L-G2 / D16 — DPDP s.5(3): the notice must be available in English or any language in the
 * Eighth Schedule, at the Data Principal's option. This is the plain-language SUMMARY of the
 * privacy notice in Hindi and Marathi. The English notice remains the operative text; the
 * summaries are marked "pending legal-cell review" until the college's legal cell signs them off.
 * Keys are identical across languages — a unit test enforces completeness.
 */
export const LEGAL_LANGS = ["en", "hi", "mr"] as const;
export type LegalLang = (typeof LEGAL_LANGS)[number];

export type LegalSummary = {
  langName: string;
  title: string;
  operativeNote: string;
  reviewNote: string;
  points: { heading: string; body: string }[];
  rights: string;
  grievance: string;
  children: string;
};

export function pickLang(raw: string | null | undefined): LegalLang {
  return (LEGAL_LANGS as readonly string[]).includes(raw ?? "") ? (raw as LegalLang) : "en";
}

export const LEGAL_SUMMARY: Record<LegalLang, LegalSummary> = {
  en: {
    langName: "English",
    title: "Privacy notice — key points",
    operativeNote: "This is a plain-language summary. The full English notice below is the operative text.",
    reviewNote: "",
    points: [
      { heading: "What we store", body: "Only the health record you choose to keep: profile, allergies, conditions, medicines, report text, appointments, and the consents you grant." },
      { heading: "Who can see it", body: "A doctor only while a consent you approved is live, or during a logged 60-minute emergency access that you are told about and can revoke." },
      { heading: "What we never do", body: "No selling, no advertising, no trackers, no analysis of your data for anyone else. Health data is never used to train AI." },
      { heading: "Where it lives", body: "On servers in Singapore (Vercel, Neon). This is disclosed under DPDP s.16; a move to India-region hosting is planned." },
      { heading: "How long", body: "While your account is active. Demo accounts are erased 7 days after creation. Access logs are kept at least one year." },
    ],
    rights: "You can see, export, correct and erase your data yourself from your account — no email needed. Withdrawing a consent is one tap.",
    grievance: "Use the in-app grievance desk; we respond within 30 days. You may escalate to the Data Protection Board of India.",
    children: "Children under 18 use CityCare only through a parent or legal guardian, who consents for them. No tracking or advertising ever applies to a child's profile.",
  },
  hi: {
    langName: "हिन्दी",
    title: "गोपनीयता सूचना — मुख्य बातें",
    operativeNote: "यह सरल भाषा में सारांश है। नीचे दी गई अंग्रेज़ी सूचना ही कानूनी रूप से मान्य पाठ है।",
    reviewNote: "इस अनुवाद की कॉलेज की विधि-कक्ष (legal cell) द्वारा समीक्षा लंबित है।",
    points: [
      { heading: "हम क्या रखते हैं", body: "केवल वह स्वास्थ्य रिकॉर्ड जो आप स्वयं रखना चुनते हैं: प्रोफ़ाइल, एलर्जी, बीमारियाँ, दवाइयाँ, रिपोर्ट का पाठ, अपॉइंटमेंट और आपके द्वारा दी गई सहमतियाँ।" },
      { heading: "कौन देख सकता है", body: "डॉक्टर केवल तब तक, जब तक आपकी दी हुई सहमति चालू है, या 60 मिनट की दर्ज (logged) आपातकालीन पहुँच के दौरान — जिसकी सूचना आपको दी जाती है और जिसे आप रद्द कर सकते हैं।" },
      { heading: "हम कभी क्या नहीं करते", body: "न डेटा बेचना, न विज्ञापन, न ट्रैकर, न किसी और के लाभ के लिए आपके डेटा का विश्लेषण। स्वास्थ्य डेटा का उपयोग AI प्रशिक्षण में कभी नहीं होता।" },
      { heading: "डेटा कहाँ रहता है", body: "सिंगापुर के सर्वरों पर (Vercel, Neon)। यह DPDP धारा 16 के अंतर्गत बताया गया है; भारत-क्षेत्र की होस्टिंग पर जाने की योजना है।" },
      { heading: "कितने समय तक", body: "जब तक आपका खाता सक्रिय है। डेमो खाते बनने के 7 दिन बाद मिटा दिए जाते हैं। पहुँच-लॉग कम से कम एक वर्ष रखे जाते हैं।" },
    ],
    rights: "आप अपने खाते से स्वयं अपना डेटा देख, निर्यात (export), सुधार और मिटा सकते हैं — किसी ईमेल की ज़रूरत नहीं। सहमति वापस लेना एक टैप में होता है।",
    grievance: "ऐप के भीतर शिकायत-डेस्क का उपयोग करें; हम 30 दिनों में उत्तर देते हैं। आप भारतीय डेटा संरक्षण बोर्ड (Data Protection Board of India) में भी शिकायत कर सकते हैं।",
    children: "18 वर्ष से कम आयु के बच्चे CityCare का उपयोग केवल माता-पिता या कानूनी अभिभावक के माध्यम से करते हैं, जो उनकी ओर से सहमति देते हैं। बच्चे की प्रोफ़ाइल पर कभी ट्रैकिंग या विज्ञापन लागू नहीं होता।",
  },
  mr: {
    langName: "मराठी",
    title: "गोपनीयता सूचना — मुख्य मुद्दे",
    operativeNote: "हा सोप्या भाषेतील सारांश आहे. खालील इंग्रजी सूचना हाच कायदेशीरदृष्ट्या लागू मजकूर आहे.",
    reviewNote: "या भाषांतराची महाविद्यालयाच्या विधी-कक्षाकडून (legal cell) तपासणी प्रलंबित आहे.",
    points: [
      { heading: "आम्ही काय साठवतो", body: "फक्त तुम्ही स्वतः ठेवायचे ठरवलेले आरोग्य रेकॉर्ड: प्रोफाइल, ॲलर्जी, आजार, औषधे, रिपोर्टचा मजकूर, अपॉइंटमेंट आणि तुम्ही दिलेल्या संमती." },
      { heading: "कोण पाहू शकते", body: "डॉक्टर फक्त तोपर्यंत, जोपर्यंत तुम्ही दिलेली संमती चालू आहे, किंवा 60 मिनिटांच्या नोंदवलेल्या (logged) आपत्कालीन प्रवेशादरम्यान — ज्याची तुम्हाला सूचना दिली जाते आणि जो तुम्ही रद्द करू शकता." },
      { heading: "आम्ही कधीही काय करत नाही", body: "डेटा विकणे नाही, जाहिरात नाही, ट्रॅकर नाही, इतर कोणाच्या फायद्यासाठी तुमच्या डेटाचे विश्लेषण नाही. आरोग्य डेटा AI प्रशिक्षणासाठी कधीही वापरला जात नाही." },
      { heading: "डेटा कुठे असतो", body: "सिंगापूरमधील सर्व्हरवर (Vercel, Neon). हे DPDP कलम 16 अंतर्गत जाहीर केले आहे; भारत-क्षेत्रातील होस्टिंगकडे जाण्याची योजना आहे." },
      { heading: "किती काळ", body: "तुमचे खाते सक्रिय असेपर्यंत. डेमो खाती तयार झाल्यानंतर 7 दिवसांनी पुसली जातात. प्रवेश-नोंदी किमान एक वर्ष ठेवल्या जातात." },
    ],
    rights: "तुम्ही तुमच्या खात्यातून स्वतः तुमचा डेटा पाहू, निर्यात (export) करू, दुरुस्त करू आणि पुसू शकता — ईमेलची गरज नाही. संमती मागे घेणे एका टॅपमध्ये होते.",
    grievance: "ॲपमधील तक्रार-डेस्क वापरा; आम्ही 30 दिवसांत उत्तर देतो. तुम्ही भारतीय डेटा संरक्षण मंडळाकडे (Data Protection Board of India) देखील तक्रार करू शकता.",
    children: "18 वर्षांखालील मुले CityCare फक्त पालक किंवा कायदेशीर पालकामार्फत वापरतात, जे त्यांच्या वतीने संमती देतात. मुलाच्या प्रोफाइलवर कधीही ट्रॅकिंग किंवा जाहिरात लागू होत नाही.",
  },
};
