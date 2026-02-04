// ====== MAPPING STATUTS BITRIX24 ======
export const LEAD_STATUS_MAP = {
  'NEW': 'Lead', 
  'IN_PROCESS': 'En traitement', 
  'PROCESSED': 'Traité',
  'CONVERTED': 'Converti', 
  'JUNK': 'Mauvais prospect',
  '1': 'Lead FR', 
  '2': 'Lead FR', 
  '3': 'Lead IT', 
  '4': 'Tentative de contact',
  '5': 'Lead IT',
  '6': 'Attente Indication',
  'UC_SFHQIF': 'Attente Questionnaire',
  'UC_2HKJLX': 'Attente Photos'
};

export const DEAL_STAGE_MAP = {
  // Pipeline DOCTOUR (défaut) - Commercial FR/EU
  'NEW': 'Nouvelle Transaction', 
  'PREPARATION': 'Devis sur indications',
  'PREPAYMENT_INVOICE': 'Devis signé', 
  'EXECUTING': 'Billet Avion Reçu',
  'FINAL_INVOICE': 'Avance Reçu', 
  'WON': 'Transaction gagnée', 
  'LOSE': 'Transaction perdue',
  'APOLOGY': 'Avance expirée',
  '1': 'Avance expirée',
  
  // Pipeline DOC-IT (C3) - Commercial Italie
  'C3:NEW': 'Nouvelle Transaction', 
  'C3:PREPARATION': 'Devis sur indications',
  'C3:PREPAYMENT_INVOICE': 'Devis signé', 
  'C3:EXECUTING': 'Billet Avion Reçu',
  'C3:FINAL_INVOICE': 'Avance Reçu', 
  'C3:WON': 'Transaction gagnée', 
  'C3:LOSE': 'Transaction perdue',
  'C3:APOLOGY': 'Avance expirée',
  'C3:1': 'Avance expirée',
  
  // Pipeline Recrutement (C1) - RH (pour affichage si besoin)
  'C1:NEW': 'Nouveau candidat', 
  'C1:PREPARATION': 'Convoqué entretien',
  'C1:PREPAYMENT_INVOICE': 'Venu entretien', 
  'C1:EXECUTING': 'Convoqué formation',
  'C1:FINAL_INVOICE': 'Venu formation', 
  'C1:WON': 'Salarié', 
  'C1:LOSE': 'Non convoqué',
  'C1:APOLOGY': 'Non venu entretien',
  'C1:1': 'En vivier',
  'C1:2': 'Non convoqué formation',
  'C1:3': 'Non venu formation',
  'C1:4': 'Non validé formation',
  
  // Pipeline Parrainage-FID (C5) - Fidélisation (pour affichage si besoin)
  'C5:NEW': 'Nouveau',
  'C5:PREPARATION': 'Proposition',
  'C5:PREPAYMENT_INVOICE': 'OK Parrainage',
  'C5:EXECUTING': 'OK Fidélisation',
  'C5:WON': 'OK PAR + FID',
  'C5:LOSE': 'NOK',
  'C5:1': 'Réclamation'
};

// Fonction pour obtenir le label d'une étape
export function getStageLabel(stageId) {
  if (!stageId) return 'Inconnu';
  return DEAL_STAGE_MAP[stageId] || stageId;
}

export const QUOTE_STATUS_MAP = {
  'DRAFT': 'Nouveau',
  'SENT': 'Demande de remise',
  '1': 'Validé responsable',
  '2': 'Envoyé au client',
  'UC_AG4WR5': 'Devis Lu',
  'APPROVED': 'Accepté',
  'DECLAINED': 'Refusé'
};

export const ACTIVITY_TYPE_MAP = {
  '1': 'Rendez-vous', 
  '2': 'Appel', 
  '3': 'Tâche', 
  '4': 'Email', 
  '6': 'SMS'
};

export const SOURCE_CATEGORIES = {
  'WhatsApp': ['whatsapp', 'wa ', 'wapp', 'edna whatsapp'],
  'Facebook': ['facebook', 'messenger', 'fb ', 'meta'],
  'Instagram': ['instagram', 'insta', 'ig '],
  'Site Web': ['site', 'website', 'chat live', 'doctour.eu', 'doctour.fr', 'doctour.ca', 'body-travel', 'web', 'devis'],
  'Lead Gen': ['lead gen', 'new lead', 'leadgen', 'campagne', 'formulaire', 'form'],
  'Appels': ['appel', 'call', 'téléphone', 'phone'],
  'Parrainage': ['parrainage', 'referral', 'recommand'],
  'Email': ['email', 'mail', 'e-mail'],
  'Migration': ['migration', 'odoo']
};

export function categorizeSource(sourceName) {
  if (!sourceName) return 'Autre';
  const lower = sourceName.toLowerCase();
  for (const [cat, keywords] of Object.entries(SOURCE_CATEGORIES)) {
    if (keywords.some(k => lower.includes(k))) return cat;
  }
  return 'Autre';
}

export const NON_COMMERCIAUX = ['yosra', 'atef', 'wassim', 'saber'];
export const RESPONSABLES = ['houda'];
export const EXCLUSIONS_TOTALES = ['bad lead', 'admin', 'test', 'demo'];

export function getUserType(name) {
  if (!name) return 'exclude';
  const lower = name.toLowerCase();
  if (EXCLUSIONS_TOTALES.some(ex => lower.includes(ex))) return 'exclude';
  if (NON_COMMERCIAUX.some(nc => lower.includes(nc))) return 'non_commercial';
  if (RESPONSABLES.some(r => lower.includes(r))) return 'responsable';
  return 'commercial';
}

export function shouldExcludeFromStats(name) {
  if (!name) return true;
  const lower = name.toLowerCase();
  return EXCLUSIONS_TOTALES.some(ex => lower.includes(ex));
}

export const PERIOD_PRESETS = [
  { id: 'today', label: "Aujourd'hui" },
  { id: 'yesterday', label: 'Hier' },
  { id: 'week', label: 'Cette semaine' },
  { id: 'lastweek', label: 'Semaine dernière' },
  { id: 'month', label: 'Ce mois' },
  { id: 'lastmonth', label: 'Mois dernier' },
  { id: 'quarter', label: 'Ce trimestre' },
  { id: 'year', label: 'Cette année' },
  { id: 'all', label: 'Tout' },
  { id: 'custom', label: 'Personnalisé' }
];

export function getPeriodDates(preset) {
  const now = new Date();
  const start = new Date();
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  switch (preset) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      break;
    case 'yesterday':
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() - 1);
      break;
    case 'week':
      const dow = start.getDay();
      start.setDate(start.getDate() - dow + (dow === 0 ? -6 : 1));
      start.setHours(0, 0, 0, 0);
      break;
    case 'lastweek':
      const dow2 = start.getDay();
      start.setDate(start.getDate() - dow2 + (dow2 === 0 ? -6 : 1) - 7);
      start.setHours(0, 0, 0, 0);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      break;
    case 'month':
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    case 'lastmonth':
      start.setMonth(start.getMonth() - 1, 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(0);
      break;
    case 'quarter':
      const q = Math.floor(now.getMonth() / 3);
      start.setMonth(q * 3, 1);
      start.setHours(0, 0, 0, 0);
      break;
    case 'year':
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      break;
    default:
      start.setFullYear(2020, 0, 1);
      start.setHours(0, 0, 0, 0);
  }
  return { start, end };
}

export const formatNumber = (n) => n?.toLocaleString('fr-FR') || '0';
export const formatCurrency = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);
export const formatPercent = (n) => `${(n || 0).toFixed(1)}%`;
export const formatDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '';
export const formatDateTime = (d) => d ? new Date(d).toLocaleString('fr-FR') : '';

export const MONTH_NAMES = {
  '01': 'Janvier', '02': 'Février', '03': 'Mars', '04': 'Avril',
  '05': 'Mai', '06': 'Juin', '07': 'Juillet', '08': 'Août',
  '09': 'Septembre', '10': 'Octobre', '11': 'Novembre', '12': 'Décembre'
};

export function formatMonthYear(key) {
  if (!key) return '';
  const [y, m] = key.split('-');
  return `${MONTH_NAMES[m] || m} ${y}`;
}

export function getRateColor(rate, target = 15) {
  if (rate >= target) return 'green';
  if (rate >= target * 0.7) return 'yellow';
  return 'red';
}

export function getVerdictEmoji(rate, target = 15) {
  if (rate >= target) return '🟢';
  if (rate >= target * 0.7) return '🟡';
  return '🔴';
}

export function daysBetween(d1, d2) {
  if (!d1 || !d2) return null;
  return Math.floor((new Date(d2) - new Date(d1)) / (1000 * 60 * 60 * 24));
}

export function isToday(date) {
  if (!date) return false;
  const d = new Date(date);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

export function daysAgo(date) {
  if (!date) return 999;
  return daysBetween(date, new Date());
}

export function calculateAverageDelay(items, startField, endField) {
  const validItems = items.filter(i => i[startField] && i[endField]);
  if (validItems.length === 0) return null;
  const totalDays = validItems.reduce((sum, i) => sum + daysBetween(i[startField], i[endField]), 0);
  return totalDays / validItems.length;
}

export function formatDelay(days) {
  if (days === null || days === undefined) return '-';
  if (days < 1) return '< 1 jour';
  if (days === 1) return '1 jour';
  return `${Math.round(days)} jours`;
}
