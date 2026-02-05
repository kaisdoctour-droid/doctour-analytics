'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { KpiCard, Badge, Button, Card, TabNav, DateRangePicker, CommercialSelect, AlertItem, RankingRow, VerdictBadge, Modal, DelayBadge } from '@/components/ui';
import { PERIOD_PRESETS, getPeriodDates, formatNumber, formatCurrency, formatPercent, formatDate, formatDateTime, formatMonthYear, getRateColor, LEAD_STATUS_MAP, DEAL_STAGE_MAP, categorizeSource, getUserType, shouldExcludeFromStats, daysAgo, daysBetween, formatDelay, NON_COMMERCIAUX, RESPONSABLES } from '@/lib/utils';

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedPeriod, setSelectedPeriod] = useState('year');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedCommercials, setSelectedCommercials] = useState([]);
  const [apiStatus, setApiStatus] = useState('connecting');
  const [objectifClosing, setObjectifClosing] = useState(15);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [selectedAlertCommercial, setSelectedAlertCommercial] = useState(null);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertModalType, setAlertModalType] = useState('leads'); // 'leads' ou 'deals'
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState('');
  
  // ========== NOUVEAUX ÉTATS POUR SYNC SÉPARÉE ==========
  const [syncingRapide, setSyncingRapide] = useState(false);
  const [syncingActivites, setSyncingActivites] = useState(false);
  const [syncingDevis, setSyncingDevis] = useState(false);
  
  // Options pour les alertes
  const [excludeWithReminder, setExcludeWithReminder] = useState(true);
  const [delaiRetard, setDelaiRetard] = useState(3); // Jours avant retard
  const [delaiCritique, setDelaiCritique] = useState(7); // Jours avant critique
  const [delaiRelanceMax, setDelaiRelanceMax] = useState(7); // Exclure si relance dans les X jours

  // Onglet Aujourd'hui
  const [selectedDayDate, setSelectedDayDate] = useState(new Date().toISOString().slice(0, 10));

  const [rawLeads, setRawLeads] = useState([]);
  const [rawDeals, setRawDeals] = useState([]);
  const [rawUsers, setRawUsers] = useState([]);
  const [rawQuotes, setRawQuotes] = useState([]);
  const [rawSources, setRawSources] = useState({});
  const [rawActivities, setRawActivities] = useState([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);

  // ========== PHASE 1 : Chargement rapide (Users, Sources, Leads, Deals, Quotes) ==========
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setApiStatus('connecting');
    try {
      // Charger les 5 endpoints légers EN PARALLÈLE
      const [usersRes, sourcesRes, leadsRes, dealsRes, quotesRes] = await Promise.all([
        fetch('/api/users'),
        fetch('/api/sources'),
        fetch('/api/leads'),
        fetch('/api/deals'),
        fetch('/api/quotes')
      ]);
      
      const [usersData, sourcesData, leadsData, dealsData, quotesData] = await Promise.all([
        usersRes.json(),
        sourcesRes.json(),
        leadsRes.json(),
        dealsRes.json(),
        quotesRes.json()
      ]);
      
      if (!usersData.success) throw new Error('Erreur utilisateurs');
      if (!leadsData.success) throw new Error('Erreur leads: ' + (leadsData.error || 'inconnu'));
      if (!dealsData.success) throw new Error('Erreur deals');
      
      setRawUsers(usersData.data || []);
      setRawSources(sourcesData.data || {});
      setRawLeads(leadsData.data || []);
      setRawDeals(dealsData.data || []);
      setRawQuotes(quotesData.data || []);
      
      setApiStatus('live');
      setLastUpdate(new Date());
    } catch (err) {
      setError(err.message);
      setApiStatus('error');
    } finally {
      setLoading(false);
    }
  }, []);

  // ========== PHASE 2 : Chargement activités en arrière-plan ==========
  const loadActivities = useCallback(async () => {
    setActivitiesLoading(true);
    try {
      const activitiesRes = await fetch('/api/activities');
      const activitiesData = await activitiesRes.json();
      setRawActivities(activitiesData.data || []);
    } catch (err) {
      console.error('Erreur chargement activités:', err);
    } finally {
      setActivitiesLoading(false);
    }
  }, []);

  // Lancer Phase 1, puis Phase 2 automatiquement
  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { 
    if (!loading && apiStatus === 'live') {
      loadActivities(); 
    }
  }, [loading, apiStatus, loadActivities]);

  // Helper pour savoir si une sync est en cours
  const isAnySyncRunning = syncingRapide || syncingActivites || syncingDevis || syncing;

  // ========== SYNC RAPIDE: Users + Sources + Leads + Deals ==========
  const syncRapide = async () => {
    if (isAnySyncRunning) return;
    setSyncingRapide(true);
    setSyncProgress('🔄 Sync rapide: initialisation...');
    
    try {
      // 1. Sync users & sources
      setSyncProgress('🔄 Sync utilisateurs et sources...');
      await fetch('/api/sync');
      
      // 2. Sync ALL leads avec pagination automatique
      setSyncProgress('🔄 Sync leads...');
      let leadsStart = 0;
      let leadsTotal = 0;
      let hasMoreLeads = true;
      
      while (hasMoreLeads) {
        setSyncProgress(`🔄 Sync leads... ${leadsTotal} importés`);
        const res = await fetch(`/api/sync-all?table=leads&start=${leadsStart}`);
        const data = await res.json();
        
        if (!data.success) {
          console.error('Erreur sync leads:', data.error);
          break;
        }
        
        leadsTotal = data.totalSynced;
        hasMoreLeads = data.hasMore;
        leadsStart = data.nextStart || 0;
        
        if (!hasMoreLeads) break;
        await new Promise(r => setTimeout(r, 1000));
      }
      
      // 3. Sync ALL deals avec pagination automatique
      setSyncProgress(`🔄 Leads OK (${leadsTotal}). Sync deals...`);
      let dealsStart = 0;
      let dealsTotal = 0;
      let hasMoreDeals = true;
      
      while (hasMoreDeals) {
        setSyncProgress(`🔄 Sync deals... ${dealsTotal} importés`);
        const res = await fetch(`/api/sync-all?table=deals&start=${dealsStart}`);
        const data = await res.json();
        
        if (!data.success) {
          console.error('Erreur sync deals:', data.error);
          break;
        }
        
        dealsTotal = data.totalSynced;
        hasMoreDeals = data.hasMore;
        dealsStart = data.nextStart || 0;
        
        if (!hasMoreDeals) break;
        await new Promise(r => setTimeout(r, 1000));
      }
      
      setSyncProgress(`✅ Sync rapide terminée! ${leadsTotal} leads, ${dealsTotal} deals`);
      
      // Recharger les données
      await loadData();
      
    } catch (err) {
      setSyncProgress(`❌ Erreur: ${err.message}`);
    } finally {
      setSyncingRapide(false);
      setTimeout(() => setSyncProgress(''), 5000);
    }
  };

  // ========== SYNC ACTIVITÉS UNIQUEMENT ==========
  const syncActivites = async () => {
    if (isAnySyncRunning) return;
    setSyncingActivites(true);
    setSyncProgress('📞 Sync activités (peut prendre 20-30 min)...');
    
    try {
      let activitiesStart = 0;
      let activitiesTotal = 0;
      let hasMoreActivities = true;
      
      while (hasMoreActivities) {
        setSyncProgress(`📞 Sync activités... ${activitiesTotal} importées`);
        const res = await fetch(`/api/sync/activities?start=${activitiesStart}`);
        const data = await res.json();
        
        if (!data.success) {
          console.error('Erreur sync activities:', data.error);
          break;
        }
        
        activitiesTotal = data.totalSynced;
        hasMoreActivities = data.hasMore;
        activitiesStart = data.nextStart || 0;
        
        if (!hasMoreActivities) break;
        await new Promise(r => setTimeout(r, 1000));
      }
      
      setSyncProgress(`✅ Activités terminées! ${activitiesTotal} activités`);
      
      // Recharger les données
      await loadData();
      
    } catch (err) {
      setSyncProgress(`❌ Erreur: ${err.message}`);
    } finally {
      setSyncingActivites(false);
      setTimeout(() => setSyncProgress(''), 5000);
    }
  };

  // ========== SYNC DEVIS UNIQUEMENT ==========
  const syncDevis = async () => {
    if (isAnySyncRunning) return;
    setSyncingDevis(true);
    setSyncProgress('📝 Sync devis...');
    
    try {
      let quotesStart = 0;
      let quotesTotal = 0;
      let hasMoreQuotes = true;
      
      while (hasMoreQuotes) {
        setSyncProgress(`📝 Sync devis... ${quotesTotal} importés`);
        const res = await fetch(`/api/sync-all?table=quotes&start=${quotesStart}`);
        const data = await res.json();
        
        if (!data.success) {
          console.error('Erreur sync quotes:', data.error);
          break;
        }
        
        quotesTotal = data.totalSynced;
        hasMoreQuotes = data.hasMore;
        quotesStart = data.nextStart || 0;
        
        if (!hasMoreQuotes) break;
        await new Promise(r => setTimeout(r, 1000));
      }
      
      setSyncProgress(`✅ Devis terminés! ${quotesTotal} devis`);
      
      // Recharger les données
      await loadData();
      
    } catch (err) {
      setSyncProgress(`❌ Erreur: ${err.message}`);
    } finally {
      setSyncingDevis(false);
      setTimeout(() => setSyncProgress(''), 5000);
    }
  };

  // Fonction de sync automatique complète (conservée pour compatibilité)
  const syncAllData = async () => {
    setSyncing(true);
    setSyncProgress('Initialisation...');
    
    try {
      // 1. Sync users & sources
      setSyncProgress('Sync utilisateurs et sources...');
      await fetch('/api/sync');
      
      // 2. Sync ALL leads avec pagination automatique
      setSyncProgress('Sync leads (peut prendre plusieurs minutes)...');
      let leadsStart = 0;
      let leadsTotal = 0;
      let hasMoreLeads = true;
      
      while (hasMoreLeads) {
        setSyncProgress(`Sync leads... ${leadsTotal} importés`);
        const res = await fetch(`/api/sync-all?table=leads&start=${leadsStart}`);
        const data = await res.json();
        
        if (!data.success) {
          console.error('Erreur sync leads:', data.error);
          break;
        }
        
        leadsTotal = data.totalSynced;
        hasMoreLeads = data.hasMore;
        leadsStart = data.nextStart || 0;
        
        if (!hasMoreLeads) break;
        await new Promise(r => setTimeout(r, 1000));
      }
      
      // 3. Sync ALL deals avec pagination automatique
      setSyncProgress(`Leads terminés (${leadsTotal}). Sync deals...`);
      let dealsStart = 0;
      let dealsTotal = 0;
      let hasMoreDeals = true;
      
      while (hasMoreDeals) {
        setSyncProgress(`Sync deals... ${dealsTotal} importés`);
        const res = await fetch(`/api/sync-all?table=deals&start=${dealsStart}`);
        const data = await res.json();
        
        if (!data.success) {
          console.error('Erreur sync deals:', data.error);
          break;
        }
        
        dealsTotal = data.totalSynced;
        hasMoreDeals = data.hasMore;
        dealsStart = data.nextStart || 0;
        
        if (!hasMoreDeals) break;
        await new Promise(r => setTimeout(r, 1000));
      }
      
      // 4. Sync Activities
      setSyncProgress(`Deals terminés (${dealsTotal}). Sync activités...`);
      let activitiesStart = 0;
      let activitiesTotal = 0;
      let hasMoreActivities = true;
      
      while (hasMoreActivities) {
        setSyncProgress(`Sync activités... ${activitiesTotal} importées`);
        const res = await fetch(`/api/sync/activities?start=${activitiesStart}`);
        const data = await res.json();
        
        if (!data.success) {
          console.error('Erreur sync activities:', data.error);
          break;
        }
        
        activitiesTotal = data.totalSynced;
        hasMoreActivities = data.hasMore;
        activitiesStart = data.nextStart || 0;
        
        if (!hasMoreActivities) break;
        await new Promise(r => setTimeout(r, 1000));
      }
      
      setSyncProgress(`Terminé! ${leadsTotal} leads, ${dealsTotal} deals, ${activitiesTotal} activités`);
      
      // Recharger les données
      await loadData();
      
    } catch (err) {
      setSyncProgress(`Erreur: ${err.message}`);
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncProgress(''), 5000);
    }
  };

  const getUserName = useCallback((id) => {
    const user = rawUsers.find(u => u.ID === id);
    return user ? (user.NAME + ' ' + (user.LAST_NAME || '')).replace(' DOCTOUR', '').trim() : 'Inconnu';
  }, [rawUsers]);

  const getSourceName = useCallback((sourceId) => {
    if (!sourceId) return 'Inconnu';
    return rawSources[sourceId] || sourceId;
  }, [rawSources]);

  const periodDates = useMemo(() => {
    if (selectedPeriod === 'custom' && customStartDate && customEndDate) {
      return { start: new Date(customStartDate), end: new Date(customEndDate + 'T23:59:59') };
    }
    return getPeriodDates(selectedPeriod);
  }, [selectedPeriod, customStartDate, customEndDate]);

  const filterByPeriod = useCallback((date) => {
    if (!date) return false;
    const d = new Date(date);
    return d >= periodDates.start && d <= periodDates.end;
  }, [periodDates]);

  const filterByCommercials = useCallback((assignedById) => {
    if (selectedCommercials.length === 0) return true;
    return selectedCommercials.includes(assignedById);
  }, [selectedCommercials]);

  // Filtrer les leads (exclure C1 et C5 n'existe pas pour les leads, c'est pour les deals)
  const filteredLeads = useMemo(() => {
    return rawLeads.filter(l => filterByPeriod(l.DATE_CREATE) && filterByCommercials(l.ASSIGNED_BY_ID));
  }, [rawLeads, filterByPeriod, filterByCommercials]);

  // Filtrer les deals en excluant C1 (Recrutement) et C5
  const filteredDeals = useMemo(() => {
    const filtered = rawDeals.filter(d => filterByPeriod(d.DATE_CREATE) && filterByCommercials(d.ASSIGNED_BY_ID));
    // Exclure les pipelines C1 (Recrutement) et C5
    return filtered.filter(d => !d.STAGE_ID || (!d.STAGE_ID.startsWith('C1:') && !d.STAGE_ID.startsWith('C5:')));
  }, [rawDeals, filterByPeriod, filterByCommercials]);

  const commercialsList = useMemo(() => {
    const users = rawUsers.filter(u => u.ACTIVE && !shouldExcludeFromStats(u.NAME)).map(u => {
      const name = (u.NAME + ' ' + (u.LAST_NAME || '')).replace(' DOCTOUR', '').trim();
      return { id: u.ID, name, initials: name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() };
    }).sort((a, b) => a.name.localeCompare(b.name));
    return users;
  }, [rawUsers]);

  // ====== Identifier les leads avec relance planifiée dans les X jours ======
  const leadsWithPendingReminder = useMemo(() => {
    const leadIds = new Set();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Date limite : aujourd'hui + delaiRelanceMax jours
    const maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + delaiRelanceMax);
    
    rawActivities.forEach(a => {
      const isCompleted = a.COMPLETED === true || a.COMPLETED === 'true' || a.COMPLETED === 'Y';
      
      if (a.OWNER_TYPE_ID === '1' && !isCompleted) {
        const deadline = a.DEADLINE ? new Date(a.DEADLINE) : null;
        const startTime = a.START_TIME ? new Date(a.START_TIME) : null;
        const activityDate = deadline || startTime;
        
        // Relance valide si : dans le futur ET dans les X jours max
        if (activityDate && activityDate >= today && activityDate <= maxDate) {
          leadIds.add(a.OWNER_ID);
        }
      }
    });
    
    return leadIds;
  }, [rawActivities, delaiRelanceMax]);

  // ====== Identifier les deals avec relance planifiée dans les X jours ======
  const dealsWithPendingReminder = useMemo(() => {
    const dealIds = new Set();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Date limite : aujourd'hui + delaiRelanceMax jours
    const maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + delaiRelanceMax);
    
    rawActivities.forEach(a => {
      const isCompleted = a.COMPLETED === true || a.COMPLETED === 'true' || a.COMPLETED === 'Y';
      
      // OWNER_TYPE_ID = '2' signifie Deal
      if (a.OWNER_TYPE_ID === '2' && !isCompleted) {
        const deadline = a.DEADLINE ? new Date(a.DEADLINE) : null;
        const startTime = a.START_TIME ? new Date(a.START_TIME) : null;
        const activityDate = deadline || startTime;
        
        // Relance valide si : dans le futur ET dans les X jours max
        if (activityDate && activityDate >= today && activityDate <= maxDate) {
          dealIds.add(a.OWNER_ID);
        }
      }
    });
    
    return dealIds;
  }, [rawActivities, delaiRelanceMax]);

  const leadStats = useMemo(() => {
    const total = filteredLeads.length;
    const converted = filteredLeads.filter(l => l.STATUS_ID === 'CONVERTED').length;
    const junk = filteredLeads.filter(l => l.STATUS_ID === 'JUNK').length;
    const inProgress = total - converted - junk;
    const txConv = total > 0 ? (converted / total) * 100 : 0;
    const byStatus = {};
    filteredLeads.forEach(l => {
      const s = LEAD_STATUS_MAP[l.STATUS_ID] || l.STATUS_ID || 'Autre';
      byStatus[s] = (byStatus[s] || 0) + 1;
    });
    const byCommercial = {};
    filteredLeads.forEach(l => {
      const id = l.ASSIGNED_BY_ID;
      if (!byCommercial[id]) byCommercial[id] = { total: 0, converted: 0, junk: 0, inProgress: 0 };
      byCommercial[id].total++;
      if (l.STATUS_ID === 'CONVERTED') byCommercial[id].converted++;
      else if (l.STATUS_ID === 'JUNK') byCommercial[id].junk++;
      else byCommercial[id].inProgress++;
    });
    const today = rawLeads.filter(l => new Date(l.DATE_CREATE).toDateString() === new Date().toDateString());
    const treatedToday = rawLeads.filter(l => new Date(l.DATE_MODIFY).toDateString() === new Date().toDateString()).length;
    return { total, converted, junk, inProgress, txConv, byStatus, byCommercial, todayTotal: today.length, treatedToday };
  }, [filteredLeads, rawLeads]);

  const dealStats = useMemo(() => {
    const total = filteredDeals.length;
    const won = filteredDeals.filter(d => d.STAGE_ID && d.STAGE_ID.includes('WON'));
    const avance = filteredDeals.filter(d => d.STAGE_ID && (d.STAGE_ID.includes('FINAL_INVOICE') || d.STAGE_ID.toLowerCase().includes('avance')) && !d.STAGE_ID.includes('APOLOGY'));
    const avanceExpiree = filteredDeals.filter(d => d.STAGE_ID && d.STAGE_ID.includes('APOLOGY')).length;
    const lost = filteredDeals.filter(d => d.STAGE_ID && d.STAGE_ID.includes('LOSE')).length;
    const ventesAvecAvance = won.length + avance.length;
    const ventesSansAvance = won.length;
    const revenue = won.reduce((s, d) => s + parseFloat(d.OPPORTUNITY || 0), 0);
    const txClosing = leadStats.converted > 0 ? (ventesAvecAvance / leadStats.converted) * 100 : 0;
    const txClosingSansAvance = leadStats.converted > 0 ? (ventesSansAvance / leadStats.converted) * 100 : 0;
    const txGlobalAvecAvance = leadStats.total > 0 ? (ventesAvecAvance / leadStats.total) * 100 : 0;
    const txGlobalSansAvance = leadStats.total > 0 ? (ventesSansAvance / leadStats.total) * 100 : 0;
    const byStage = {};
    filteredDeals.forEach(d => {
      const s = DEAL_STAGE_MAP[d.STAGE_ID] || d.STAGE_ID || 'Autre';
      if (!byStage[s]) byStage[s] = { count: 0, value: 0 };
      byStage[s].count++;
      byStage[s].value += parseFloat(d.OPPORTUNITY || 0);
    });
    const byCommercial = {};
    filteredDeals.forEach(d => {
      const id = d.ASSIGNED_BY_ID;
      if (!byCommercial[id]) byCommercial[id] = { total: 0, won: 0, avance: 0, ventesAvecAvance: 0, ventesSansAvance: 0, lost: 0, revenue: 0, avanceExpiree: 0 };
      byCommercial[id].total++;
      if (d.STAGE_ID && d.STAGE_ID.includes('WON')) {
        byCommercial[id].won++;
        byCommercial[id].ventesAvecAvance++;
        byCommercial[id].ventesSansAvance++;
        byCommercial[id].revenue += parseFloat(d.OPPORTUNITY || 0);
      } else if (d.STAGE_ID && (d.STAGE_ID.includes('FINAL_INVOICE') || d.STAGE_ID.toLowerCase().includes('avance')) && !d.STAGE_ID.includes('APOLOGY')) {
        byCommercial[id].avance++;
        byCommercial[id].ventesAvecAvance++;
      } else if (d.STAGE_ID && d.STAGE_ID.includes('APOLOGY')) {
        byCommercial[id].avanceExpiree++;
      } else if (d.STAGE_ID && d.STAGE_ID.includes('LOSE')) {
        byCommercial[id].lost++;
      }
    });
    return { total, won: won.length, avance: avance.length, avanceExpiree, ventesAvecAvance, ventesSansAvance, lost, revenue, txClosing, txClosingSansAvance, txGlobalAvecAvance, txGlobalSansAvance, byStage, byCommercial };
  }, [filteredDeals, leadStats]);

  // ====== ALERTES LEADS ======
  const alertsLeads = useMemo(() => {
    const staleLeads = rawLeads.filter(l => {
      // Exclure les leads terminés (convertis ou mauvais)
      if (['CONVERTED', 'JUNK'].includes(l.STATUS_ID)) return false;
      
      // Utiliser LAST_ACTIVITY_TIME (vrai dernier contact) si disponible, sinon DATE_MODIFY
      const lastContact = (l.LAST_ACTIVITY_TIME && l.LAST_ACTIVITY_TIME !== '') ? l.LAST_ACTIVITY_TIME : l.DATE_MODIFY;
      
      // Vérifier si le lead est en retard
      const isStale = daysAgo(lastContact) > delaiRetard;
      if (!isStale) return false;
      
      // Exclure si le lead a une relance planifiée (si option activée)
      if (excludeWithReminder && leadsWithPendingReminder.has(l.ID)) {
        return false;
      }
      
      return true;
    });
    
    const byCommercial = {};
    staleLeads.forEach(l => {
      const id = l.ASSIGNED_BY_ID;
      const user = rawUsers.find(u => u.ID === id);
      const name = user ? (user.NAME + ' ' + user.LAST_NAME).replace(' DOCTOUR', '') : 'Inconnu';
      
      // Exclure Inconnu et comptes test
      if (name === 'Inconnu') return;
      if (shouldExcludeFromStats(name)) return;
      if (user) {
        const fullName = ((user.NAME || '') + ' ' + (user.LAST_NAME || '')).toLowerCase();
        if (fullName.includes('test') || fullName.includes('admin') || fullName.includes('demo')) return;
      }
      
      if (!byCommercial[id]) byCommercial[id] = { name, count: 0, leads: [], type: getUserType(name) };
      byCommercial[id].count++;
      
      const hasReminder = leadsWithPendingReminder.has(l.ID);
      const lastContact = (l.LAST_ACTIVITY_TIME && l.LAST_ACTIVITY_TIME !== '') ? l.LAST_ACTIVITY_TIME : l.DATE_MODIFY;
      
      byCommercial[id].leads.push({
        id: l.ID, title: l.TITLE || l.NAME || 'Sans nom', status: LEAD_STATUS_MAP[l.STATUS_ID] || l.STATUS_ID,
        dateCreate: l.DATE_CREATE, dateModify: l.DATE_MODIFY, lastContact: lastContact, daysAgo: daysAgo(lastContact),
        phone: l.PHONE && l.PHONE[0] ? l.PHONE[0].VALUE : '', source: getSourceName(l.SOURCE_ID),
        hasReminder
      });
    });
    
    const byEtape = {};
    staleLeads.forEach(l => {
      const s = LEAD_STATUS_MAP[l.STATUS_ID] || l.STATUS_ID || 'Autre';
      byEtape[s] = (byEtape[s] || 0) + 1;
    });
    
    const critical = staleLeads.filter(l => {
      const lastContact = (l.LAST_ACTIVITY_TIME && l.LAST_ACTIVITY_TIME !== '') ? l.LAST_ACTIVITY_TIME : l.DATE_MODIFY;
      return daysAgo(lastContact) > delaiCritique;
    }).length;
    
    // Compter les leads exclus car ils ont une relance
    const excludedByReminder = rawLeads.filter(l => {
      if (['CONVERTED', 'JUNK'].includes(l.STATUS_ID)) return false;
      const lastContact = (l.LAST_ACTIVITY_TIME && l.LAST_ACTIVITY_TIME !== '') ? l.LAST_ACTIVITY_TIME : l.DATE_MODIFY;
      if (daysAgo(lastContact) <= delaiRetard) return false;
      return leadsWithPendingReminder.has(l.ID);
    }).length;
    
    return { total: staleLeads.length, critical, byCommercial, byEtape, excludedByReminder, totalWithReminder: leadsWithPendingReminder.size };
  }, [rawLeads, rawUsers, getSourceName, excludeWithReminder, leadsWithPendingReminder, delaiRetard, delaiCritique]);

  // ====== ALERTES DEALS ======
  const alertsDeals = useMemo(() => {
    // Filtrer les deals en excluant C1, C5, Won, Lose, Avance expirée
    const staleDeals = rawDeals.filter(d => {
      // Exclure les pipelines C1 et C5
      if (d.STAGE_ID && (d.STAGE_ID.startsWith('C1:') || d.STAGE_ID.startsWith('C5:'))) return false;
      
      // Exclure les deals terminés (Won, Lose, Avance expirée)
      if (d.STAGE_ID && (d.STAGE_ID.includes('WON') || d.STAGE_ID.includes('LOSE') || d.STAGE_ID.includes('APOLOGY'))) return false;
      
      // Utiliser LAST_ACTIVITY_TIME (vrai dernier contact) si disponible, sinon DATE_MODIFY
      const lastContact = (d.LAST_ACTIVITY_TIME && d.LAST_ACTIVITY_TIME !== '') ? d.LAST_ACTIVITY_TIME : d.DATE_MODIFY;
      
      // Vérifier si le deal est en retard
      const isStale = daysAgo(lastContact) > delaiRetard;
      if (!isStale) return false;
      
      // Exclure si le deal a une relance planifiée (si option activée)
      if (excludeWithReminder && dealsWithPendingReminder.has(d.ID)) {
        return false;
      }
      
      return true;
    });
    
    const byCommercial = {};
    staleDeals.forEach(d => {
      const id = d.ASSIGNED_BY_ID;
      const user = rawUsers.find(u => u.ID === id);
      const name = user ? (user.NAME + ' ' + user.LAST_NAME).replace(' DOCTOUR', '') : 'Inconnu';
      
      // Exclure Inconnu et comptes test
      if (name === 'Inconnu') return;
      if (shouldExcludeFromStats(name)) return;
      if (user) {
        const fullName = ((user.NAME || '') + ' ' + (user.LAST_NAME || '')).toLowerCase();
        if (fullName.includes('test') || fullName.includes('admin') || fullName.includes('demo')) return;
      }
      
      if (!byCommercial[id]) byCommercial[id] = { name, count: 0, deals: [], type: getUserType(name) };
      byCommercial[id].count++;
      
      const hasReminder = dealsWithPendingReminder.has(d.ID);
      const lastContact = (d.LAST_ACTIVITY_TIME && d.LAST_ACTIVITY_TIME !== '') ? d.LAST_ACTIVITY_TIME : d.DATE_MODIFY;
      
      byCommercial[id].deals.push({
        id: d.ID, title: d.TITLE || 'Sans nom', stage: DEAL_STAGE_MAP[d.STAGE_ID] || d.STAGE_ID,
        dateCreate: d.DATE_CREATE, dateModify: d.DATE_MODIFY, lastContact: lastContact, daysAgo: daysAgo(lastContact),
        opportunity: d.OPPORTUNITY, hasReminder
      });
    });
    
    const byEtape = {};
    staleDeals.forEach(d => {
      const s = DEAL_STAGE_MAP[d.STAGE_ID] || d.STAGE_ID || 'Autre';
      byEtape[s] = (byEtape[s] || 0) + 1;
    });
    
    const critical = staleDeals.filter(d => {
      const lastContact = (d.LAST_ACTIVITY_TIME && d.LAST_ACTIVITY_TIME !== '') ? d.LAST_ACTIVITY_TIME : d.DATE_MODIFY;
      return daysAgo(lastContact) > delaiCritique;
    }).length;
    
    // Compter les deals exclus car ils ont une relance
    const excludedByReminder = rawDeals.filter(d => {
      if (d.STAGE_ID && (d.STAGE_ID.startsWith('C1:') || d.STAGE_ID.startsWith('C5:'))) return false;
      if (d.STAGE_ID && (d.STAGE_ID.includes('WON') || d.STAGE_ID.includes('LOSE') || d.STAGE_ID.includes('APOLOGY'))) return false;
      const lastContact = (d.LAST_ACTIVITY_TIME && d.LAST_ACTIVITY_TIME !== '') ? d.LAST_ACTIVITY_TIME : d.DATE_MODIFY;
      if (daysAgo(lastContact) <= delaiRetard) return false;
      return dealsWithPendingReminder.has(d.ID);
    }).length;
    
    return { total: staleDeals.length, critical, byCommercial, byEtape, excludedByReminder, totalWithReminder: dealsWithPendingReminder.size };
  }, [rawDeals, rawUsers, excludeWithReminder, dealsWithPendingReminder, delaiRetard, delaiCritique]);

  // Devis expirés (séparé)
  const expiredQuotes = useMemo(() => {
    return rawQuotes.filter(q => !['APPROVED', 'DECLINED'].includes(q.STATUS_ID) && daysAgo(q.DATE_CREATE) > 30).length;
  }, [rawQuotes]);

  const sourceStats = useMemo(() => {
    const stats = {};
    filteredLeads.forEach(l => {
      const sourceId = l.SOURCE_ID || 'Inconnu';
      const sourceName = getSourceName(sourceId);
      const category = categorizeSource(sourceName);
      if (!stats[sourceId]) stats[sourceId] = { sourceId, source: sourceName, category, leads: 0, converted: 0, junk: 0, won: 0, avance: 0 };
      stats[sourceId].leads++;
      if (l.STATUS_ID === 'CONVERTED') stats[sourceId].converted++;
      else if (l.STATUS_ID === 'JUNK') stats[sourceId].junk++;
    });
    filteredDeals.forEach(d => {
      const lead = rawLeads.find(l => l.ID === d.LEAD_ID);
      if (lead) {
        const sourceId = lead.SOURCE_ID || 'Inconnu';
        if (stats[sourceId]) {
          if (d.STAGE_ID && d.STAGE_ID.includes('WON')) stats[sourceId].won++;
          else if (d.STAGE_ID && (d.STAGE_ID.includes('FINAL_INVOICE') || d.STAGE_ID.toLowerCase().includes('avance')) && !d.STAGE_ID.includes('APOLOGY')) stats[sourceId].avance++;
        }
      }
    });
    return Object.values(stats).map(s => ({
      ...s, ventesAvecAvance: s.won + s.avance, ventesSansAvance: s.won,
      txConv: s.leads > 0 ? (s.converted / s.leads) * 100 : 0,
      txClosing: s.converted > 0 ? ((s.won + s.avance) / s.converted) * 100 : 0,
      txGlobalAvec: s.leads > 0 ? ((s.won + s.avance) / s.leads) * 100 : 0,
      txGlobalSans: s.leads > 0 ? (s.won / s.leads) * 100 : 0
    })).sort((a, b) => b.leads - a.leads);
  }, [filteredLeads, filteredDeals, rawLeads, getSourceName]);

  const categoryStats = useMemo(() => {
    const cats = {};
    sourceStats.forEach(s => {
      if (!cats[s.category]) cats[s.category] = { category: s.category, leads: 0, converted: 0, won: 0, avance: 0 };
      cats[s.category].leads += s.leads;
      cats[s.category].converted += s.converted;
      cats[s.category].won += s.won;
      cats[s.category].avance += s.avance;
    });
    return Object.values(cats).map(c => ({
      ...c, ventesAvecAvance: c.won + c.avance,
      txConv: c.leads > 0 ? (c.converted / c.leads) * 100 : 0,
      txClosing: c.converted > 0 ? ((c.won + c.avance) / c.converted) * 100 : 0,
      txGlobalAvec: c.leads > 0 ? ((c.won + c.avance) / c.leads) * 100 : 0
    })).sort((a, b) => b.leads - a.leads);
  }, [sourceStats]);

  const monthlyEvolution = useMemo(() => {
    const byMonth = {};
    filteredLeads.forEach(l => {
      const d = new Date(l.DATE_CREATE);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      if (!byMonth[key]) byMonth[key] = { date: key, leads: 0, converted: 0, junk: 0, won: 0, avance: 0, revenue: 0 };
      byMonth[key].leads++;
      if (l.STATUS_ID === 'CONVERTED') byMonth[key].converted++;
      else if (l.STATUS_ID === 'JUNK') byMonth[key].junk++;
    });
    filteredDeals.forEach(d => {
      const date = new Date(d.DATE_CREATE);
      const key = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
      if (!byMonth[key]) byMonth[key] = { date: key, leads: 0, converted: 0, junk: 0, won: 0, avance: 0, revenue: 0 };
      if (d.STAGE_ID && d.STAGE_ID.includes('WON')) {
        byMonth[key].won++;
        byMonth[key].revenue += parseFloat(d.OPPORTUNITY || 0);
      } else if (d.STAGE_ID && (d.STAGE_ID.includes('FINAL_INVOICE') || d.STAGE_ID.toLowerCase().includes('avance')) && !d.STAGE_ID.includes('APOLOGY')) {
        byMonth[key].avance++;
      }
    });
    return Object.values(byMonth).map(m => ({
      ...m, ventesAvecAvance: m.won + m.avance,
      txConv: m.leads > 0 ? (m.converted / m.leads) * 100 : 0,
      txClosing: m.converted > 0 ? ((m.won + m.avance) / m.converted) * 100 : 0,
      txGlobalAvec: m.leads > 0 ? ((m.won + m.avance) / m.leads) * 100 : 0
    })).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredLeads, filteredDeals]);

  const commercialStats = useMemo(() => {
    return commercialsList.map(c => {
      const leadS = leadStats.byCommercial[c.id] || { total: 0, converted: 0, junk: 0, inProgress: 0 };
      const dealS = dealStats.byCommercial[c.id] || { total: 0, won: 0, avance: 0, ventesAvecAvance: 0, ventesSansAvance: 0, lost: 0, revenue: 0, avanceExpiree: 0 };
      const txConv = leadS.total > 0 ? (leadS.converted / leadS.total) * 100 : 0;
      const txClosing = leadS.converted > 0 ? (dealS.ventesAvecAvance / leadS.converted) * 100 : 0;
      const txClosingSansAvance = leadS.converted > 0 ? (dealS.ventesSansAvance / leadS.converted) * 100 : 0;
      const txGlobalAvec = leadS.total > 0 ? (dealS.ventesAvecAvance / leadS.total) * 100 : 0;
      return { ...c, leads: leadS.total, converted: leadS.converted, bad: leadS.junk, won: dealS.won, avance: dealS.avance, ventesAvecAvance: dealS.ventesAvecAvance, lost: dealS.lost, revenue: dealS.revenue, txConv, txClosing, txClosingSansAvance, txGlobalAvec };
    }).sort((a, b) => b.leads - a.leads);
  }, [commercialsList, leadStats, dealStats]);

  const delayStats = useMemo(() => {
    const leadToConverted = filteredLeads.filter(l => l.STATUS_ID === 'CONVERTED' && l.DATE_CREATE && l.DATE_MODIFY);
    const avgLeadToConverted = leadToConverted.length > 0 ? leadToConverted.reduce((s, l) => s + daysBetween(l.DATE_CREATE, l.DATE_MODIFY), 0) / leadToConverted.length : null;
    
    const leadToJunk = filteredLeads.filter(l => l.STATUS_ID === 'JUNK' && l.DATE_CREATE && l.DATE_MODIFY);
    const avgLeadToJunk = leadToJunk.length > 0 ? leadToJunk.reduce((s, l) => s + daysBetween(l.DATE_CREATE, l.DATE_MODIFY), 0) / leadToJunk.length : null;
    
    const wonDeals = filteredDeals.filter(d => d.STAGE_ID && d.STAGE_ID.includes('WON') && d.DATE_CREATE && d.CLOSEDATE);
    const avgDealToWon = wonDeals.length > 0 ? wonDeals.reduce((s, d) => s + daysBetween(d.DATE_CREATE, d.CLOSEDATE), 0) / wonDeals.length : null;
    
    const avanceDeals = filteredDeals.filter(d => d.STAGE_ID && (d.STAGE_ID.includes('FINAL_INVOICE') || d.STAGE_ID.toLowerCase().includes('avance')) && !d.STAGE_ID.includes('APOLOGY') && d.DATE_CREATE && d.DATE_MODIFY);
    const avgDealToAvance = avanceDeals.length > 0 ? avanceDeals.reduce((s, d) => s + daysBetween(d.DATE_CREATE, d.DATE_MODIFY), 0) / avanceDeals.length : null;
    
    // Délai Lead → Won (via LEAD_ID du deal)
    const wonDealsWithLead = wonDeals.filter(d => d.LEAD_ID);
    const leadToWonDelays = wonDealsWithLead.map(d => {
      const lead = rawLeads.find(l => l.ID === d.LEAD_ID);
      if (lead && lead.DATE_CREATE && d.CLOSEDATE) {
        return daysBetween(lead.DATE_CREATE, d.CLOSEDATE);
      }
      return null;
    }).filter(x => x !== null);
    const avgLeadToWon = leadToWonDelays.length > 0 ? leadToWonDelays.reduce((s, d) => s + d, 0) / leadToWonDelays.length : null;
    
    // Délai Lead → Avance (via LEAD_ID du deal)
    const avanceDealsWithLead = avanceDeals.filter(d => d.LEAD_ID);
    const leadToAvanceDelays = avanceDealsWithLead.map(d => {
      const lead = rawLeads.find(l => l.ID === d.LEAD_ID);
      if (lead && lead.DATE_CREATE && d.DATE_MODIFY) {
        return daysBetween(lead.DATE_CREATE, d.DATE_MODIFY);
      }
      return null;
    }).filter(x => x !== null);
    const avgLeadToAvance = leadToAvanceDelays.length > 0 ? leadToAvanceDelays.reduce((s, d) => s + d, 0) / leadToAvanceDelays.length : null;
    
    return { avgLeadToConverted, avgLeadToJunk, avgDealToWon, avgDealToAvance, avgLeadToWon, avgLeadToAvance };
  }, [filteredLeads, filteredDeals, rawLeads]);

  const topClosers = useMemo(() => {
    return commercialStats.filter(c => c.converted >= 10).sort((a, b) => b.txClosing - a.txClosing).slice(0, 5);
  }, [commercialStats]);

  // ====== QUALITÉ DES DONNÉES ======
  const qualityStats = useMemo(() => {
    // === QUALITÉ: Toujours utiliser TOUTES les données (pas filtrées par période) ===
    // Exclure seulement les pipelines C1/C5
    const allDealsForQuality = rawDeals.filter(d => !d.STAGE_ID || (!d.STAGE_ID.startsWith('C1:') && !d.STAGE_ID.startsWith('C5:')));
    
    // Deals sans lead (orphelins)
    const dealsWithoutLead = allDealsForQuality.filter(d => 
      !d.LEAD_ID || d.LEAD_ID === '' || d.LEAD_ID === '0'
    );
    
    const wonWithoutLead = dealsWithoutLead.filter(d => d.STAGE_ID && d.STAGE_ID.includes('WON'));
    const inProgressWithoutLead = dealsWithoutLead.filter(d => 
      d.STAGE_ID && !d.STAGE_ID.includes('WON') && !d.STAGE_ID.includes('LOSE') && !d.STAGE_ID.includes('APOLOGY')
    );
    const lostWithoutLead = dealsWithoutLead.filter(d => d.STAGE_ID && d.STAGE_ID.includes('LOSE'));
    
    // Grouper par commercial
    const byCommercial = {};
    dealsWithoutLead.forEach(d => {
      const id = d.ASSIGNED_BY_ID;
      const name = getUserName(id);
      if (!byCommercial[id]) byCommercial[id] = { name, total: 0, won: 0, inProgress: 0, lost: 0, deals: [] };
      byCommercial[id].total++;
      if (d.STAGE_ID && d.STAGE_ID.includes('WON')) byCommercial[id].won++;
      else if (d.STAGE_ID && d.STAGE_ID.includes('LOSE')) byCommercial[id].lost++;
      else byCommercial[id].inProgress++;
      byCommercial[id].deals.push({
        id: d.ID,
        title: d.TITLE || 'Sans nom',
        stage: DEAL_STAGE_MAP[d.STAGE_ID] || d.STAGE_ID,
        opportunity: d.OPPORTUNITY,
        dateCreate: d.DATE_CREATE
      });
    });
    
    // === Créer des Sets des IDs qui ont au moins une activité ===
    // IMPORTANT: Normaliser en String pour éviter les problèmes de comparaison
    const dealsWithActivity = new Set();
    const leadsWithActivity = new Set();
    rawActivities.forEach(a => {
      if (a.OWNER_TYPE_ID === '2') dealsWithActivity.add(String(a.OWNER_ID));
      if (a.OWNER_TYPE_ID === '1') leadsWithActivity.add(String(a.OWNER_ID));
    });
    
    // === Helper: vérifier si une fiche a été travaillée ===
    const hasBeenWorkedDeal = (d) => {
      if (dealsWithActivity.has(String(d.ID))) return true;
      if (d.DATE_MODIFY && d.DATE_CREATE) {
        const dateModify = new Date(d.DATE_MODIFY).getTime();
        const dateCreate = new Date(d.DATE_CREATE).getTime();
        if (dateModify - dateCreate > 60000) return true;
      }
      return false;
    };
    
    // === Deals sans aucune activité (jamais contactés) ===
    const dealsWithoutActivity = allDealsForQuality.filter(d => 
      !hasBeenWorkedDeal(d) && 
      d.STAGE_ID && 
      !d.STAGE_ID.includes('WON') && 
      !d.STAGE_ID.includes('LOSE') && 
      !d.STAGE_ID.includes('APOLOGY')
    ).map(d => ({
      id: d.ID,
      title: d.TITLE || 'Sans nom',
      stage: DEAL_STAGE_MAP[d.STAGE_ID] || d.STAGE_ID,
      stageId: d.STAGE_ID,
      opportunity: d.OPPORTUNITY,
      dateCreate: d.DATE_CREATE,
      daysOld: d.DATE_CREATE ? Math.floor((new Date() - new Date(d.DATE_CREATE)) / (1000 * 60 * 60 * 24)) : 0,
      commercial: getUserName(d.ASSIGNED_BY_ID)
    })).sort((a, b) => b.daysOld - a.daysOld);
    
    // === Leads sans aucune activité (jamais contactés) ===
    // Fallback: si DATE_MODIFY > DATE_CREATE (lead modifié), on considère qu'il a été travaillé
    const hasBeenWorkedLead = (l) => {
      // Si activité existe → travaillé
      if (leadsWithActivity.has(String(l.ID))) return true;
      // Si DATE_MODIFY existe et différente de DATE_CREATE → travaillé
      if (l.DATE_MODIFY && l.DATE_CREATE) {
        const dateModify = new Date(l.DATE_MODIFY).getTime();
        const dateCreate = new Date(l.DATE_CREATE).getTime();
        // Tolérance de 1 minute pour éviter les faux positifs
        if (dateModify - dateCreate > 60000) return true;
      }
      return false;
    };
    
    const leadsWithoutActivity = rawLeads.filter(l => 
      !hasBeenWorkedLead(l) && 
      l.STATUS_ID && 
      l.STATUS_ID !== 'CONVERTED' && 
      l.STATUS_ID !== 'JUNK'
    ).map(l => ({
      id: l.ID,
      title: l.NAME || l.TITLE || 'Sans nom',
      status: LEAD_STATUS_MAP[l.STATUS_ID] || l.STATUS_ID,
      statusId: l.STATUS_ID,
      dateCreate: l.DATE_CREATE,
      daysOld: l.DATE_CREATE ? Math.floor((new Date() - new Date(l.DATE_CREATE)) / (1000 * 60 * 60 * 24)) : 0,
      commercial: getUserName(l.ASSIGNED_BY_ID)
    })).sort((a, b) => b.daysOld - a.daysOld);
    
    // === NOUVEAU: Leads/Deals assignés à des utilisateurs inactifs ===
    const activeUserIds = new Set(rawUsers.map(u => u.ID));
    
    const leadsOrphelins = rawLeads.filter(l => 
      l.ASSIGNED_BY_ID && 
      !activeUserIds.has(l.ASSIGNED_BY_ID) &&
      l.STATUS_ID && l.STATUS_ID !== 'CONVERTED' && l.STATUS_ID !== 'JUNK'
    ).map(l => ({
      id: l.ID,
      title: l.NAME || l.TITLE || 'Sans nom',
      status: LEAD_STATUS_MAP[l.STATUS_ID] || l.STATUS_ID,
      statusId: l.STATUS_ID,
      dateCreate: l.DATE_CREATE,
      daysOld: l.DATE_CREATE ? Math.floor((new Date() - new Date(l.DATE_CREATE)) / (1000 * 60 * 60 * 24)) : 0,
      commercialId: l.ASSIGNED_BY_ID
    })).sort((a, b) => b.daysOld - a.daysOld);
    
    const dealsOrphelins = rawDeals.filter(d => 
      d.ASSIGNED_BY_ID && 
      !activeUserIds.has(d.ASSIGNED_BY_ID) &&
      d.STAGE_ID && !d.STAGE_ID.includes('WON') && !d.STAGE_ID.includes('LOSE') && !d.STAGE_ID.includes('APOLOGY') &&
      !d.STAGE_ID.startsWith('C1:') && !d.STAGE_ID.startsWith('C5:')
    ).map(d => ({
      id: d.ID,
      title: d.TITLE || 'Sans nom',
      stage: DEAL_STAGE_MAP[d.STAGE_ID] || d.STAGE_ID,
      stageId: d.STAGE_ID,
      opportunity: d.OPPORTUNITY,
      dateCreate: d.DATE_CREATE,
      daysOld: d.DATE_CREATE ? Math.floor((new Date() - new Date(d.DATE_CREATE)) / (1000 * 60 * 60 * 24)) : 0,
      commercialId: d.ASSIGNED_BY_ID
    })).sort((a, b) => b.daysOld - a.daysOld);
    
    // Clients fidèles (leads avec plusieurs deals Won) - TOUTES les données
    const leadDealsCount = {};
    allDealsForQuality.forEach(d => {
      if (d.LEAD_ID && d.LEAD_ID !== '' && d.LEAD_ID !== '0' && d.STAGE_ID && d.STAGE_ID.includes('WON')) {
        if (!leadDealsCount[d.LEAD_ID]) leadDealsCount[d.LEAD_ID] = { count: 0, totalCA: 0, deals: [] };
        leadDealsCount[d.LEAD_ID].count++;
        leadDealsCount[d.LEAD_ID].totalCA += parseFloat(d.OPPORTUNITY || 0);
        leadDealsCount[d.LEAD_ID].deals.push(d);
      }
    });
    const loyalClients = Object.entries(leadDealsCount)
      .filter(([_, data]) => data.count > 1)
      .map(([leadId, data]) => {
        const lead = rawLeads.find(l => l.ID === leadId);
        return {
          leadId,
          name: lead ? (lead.NAME || lead.TITLE) : 'Inconnu',
          phone: lead?.PHONE?.[0]?.VALUE || '',
          email: lead?.EMAIL?.[0]?.VALUE || '',
          nbWon: data.count,
          totalCA: data.totalCA
        };
      })
      .sort((a, b) => b.nbWon - a.nbWon || b.totalCA - a.totalCA);
    
    return {
      dealsWithoutLead: {
        total: dealsWithoutLead.length,
        won: wonWithoutLead.length,
        inProgress: inProgressWithoutLead.length,
        lost: lostWithoutLead.length,
        byCommercial,
        list: dealsWithoutLead.map(d => {
          // Chercher un lead potentiel avec le même nom (normalisation)
          const dealTitle = (d.TITLE || '').toLowerCase().trim();
          const matchingLead = rawLeads.find(l => {
            const leadName = (l.NAME || l.TITLE || '').toLowerCase().trim();
            // Match si le nom du lead contient le nom du deal ou vice versa (au moins 3 caractères)
            if (dealTitle.length < 3 || leadName.length < 3) return false;
            return leadName.includes(dealTitle) || dealTitle.includes(leadName) || 
                   // Match par mots clés (prénom ou nom)
                   dealTitle.split(' ').some(word => word.length > 2 && leadName.includes(word)) ||
                   leadName.split(' ').some(word => word.length > 2 && dealTitle.includes(word));
          });
          
          // Vérifier si c'est un conflit (lead assigné à quelqu'un d'autre)
          const hasConflict = matchingLead && matchingLead.ASSIGNED_BY_ID !== d.ASSIGNED_BY_ID;
          
          return {
            id: d.ID,
            title: d.TITLE || 'Sans nom',
            stage: DEAL_STAGE_MAP[d.STAGE_ID] || d.STAGE_ID,
            stageId: d.STAGE_ID,
            opportunity: d.OPPORTUNITY,
            dateCreate: d.DATE_CREATE,
            commercial: getUserName(d.ASSIGNED_BY_ID),
            commercialId: d.ASSIGNED_BY_ID,
            // Info sur le lead potentiel
            matchingLead: matchingLead ? {
              id: matchingLead.ID,
              name: matchingLead.NAME || matchingLead.TITLE,
              commercial: getUserName(matchingLead.ASSIGNED_BY_ID),
              commercialId: matchingLead.ASSIGNED_BY_ID,
              status: matchingLead.STATUS_ID
            } : null,
            hasConflict
          };
        }).sort((a, b) => new Date(b.dateCreate) - new Date(a.dateCreate))
      },
      dealsWithoutActivity,
      leadsWithoutActivity,
      leadsOrphelins,
      dealsOrphelins,
      loyalClients
    };
  }, [rawDeals, rawLeads, rawUsers, rawActivities, getUserName]);

  // ====== DEALS CHAUDS (Avance Reçu + Devis Signé) ======
  const hotDealsStats = useMemo(() => {
    const now = new Date();
    
    // Créer un index des dernières activités par deal (owner_type_id = '2')
    const lastActivityByDeal = {};
    rawActivities.forEach(a => {
      if (a.OWNER_TYPE_ID === '2') {
        const dealId = a.OWNER_ID;
        const actDate = a.CREATED ? new Date(a.CREATED) : null;
        if (actDate && (!lastActivityByDeal[dealId] || actDate > lastActivityByDeal[dealId])) {
          lastActivityByDeal[dealId] = actDate;
        }
      }
    });
    
    // Filtrer les deals commerciaux (hors C1/C5)
    const commercialDeals = rawDeals.filter(d => 
      d.STAGE_ID && !d.STAGE_ID.startsWith('C1:') && !d.STAGE_ID.startsWith('C5:')
    );
    
    // Devis Signés
    const devisSigne = commercialDeals.filter(d => 
      d.STAGE_ID && (d.STAGE_ID.includes('PREPAYMENT_INVOICE') || d.STAGE_ID.toLowerCase().includes('devis signé'))
    );
    
    // Avance Reçu (FINAL_INVOICE mais pas APOLOGY)
    const avanceRecu = commercialDeals.filter(d => 
      d.STAGE_ID && d.STAGE_ID.includes('FINAL_INVOICE') && !d.STAGE_ID.includes('APOLOGY')
    );
    
    // Billet Avion Reçu
    const billetRecu = commercialDeals.filter(d => 
      d.STAGE_ID && d.STAGE_ID.includes('EXECUTING')
    );
    
    // Fonction pour calculer les jours depuis dernier contact
    // Prend le MAX entre LAST_ACTIVITY_TIME (Bitrix) et la dernière activité dans notre table
    const getDaysSinceContact = (d) => {
      const bitrixDate = d.LAST_ACTIVITY_TIME ? new Date(d.LAST_ACTIVITY_TIME) : null;
      const activityDate = lastActivityByDeal[d.ID] || null;
      
      // Prendre la date la plus récente
      let lastContact = null;
      if (bitrixDate && activityDate) {
        lastContact = bitrixDate > activityDate ? bitrixDate : activityDate;
      } else {
        lastContact = bitrixDate || activityDate || (d.DATE_MODIFY ? new Date(d.DATE_MODIFY) : null);
      }
      
      if (!lastContact) return 999;
      return Math.floor((now - lastContact) / (1000 * 60 * 60 * 24));
    };
    
    // Fonction pour obtenir la date du dernier contact
    const getLastContactDate = (d) => {
      const bitrixDate = d.LAST_ACTIVITY_TIME ? new Date(d.LAST_ACTIVITY_TIME) : null;
      const activityDate = lastActivityByDeal[d.ID] || null;
      
      if (bitrixDate && activityDate) {
        return bitrixDate > activityDate ? bitrixDate : activityDate;
      }
      return bitrixDate || activityDate || (d.DATE_MODIFY ? new Date(d.DATE_MODIFY) : null);
    };
    
    // Fonction pour calculer les jours en étape actuelle
    const getDaysInStage = (d) => {
      // Utiliser MOVED_TIME (vraie date de changement d'étape) si disponible
      // Sinon fallback sur DATE_MODIFY
      const stageDate = d.MOVED_TIME || d.DATE_MODIFY;
      if (!stageDate) return 999;
      return Math.floor((now - new Date(stageDate)) / (1000 * 60 * 60 * 24));
    };
    
    // Mapper les deals avec infos enrichies
    const mapDeal = (d) => ({
      id: d.ID,
      title: d.TITLE || 'Sans nom',
      stage: DEAL_STAGE_MAP[d.STAGE_ID] || d.STAGE_ID,
      stageId: d.STAGE_ID,
      opportunity: parseFloat(d.OPPORTUNITY || 0),
      dateCreate: d.DATE_CREATE,
      lastContact: getLastContactDate(d),
      daysSinceContact: getDaysSinceContact(d),
      movedTime: d.MOVED_TIME,
      daysInStage: getDaysInStage(d),
      commercial: getUserName(d.ASSIGNED_BY_ID),
      commercialId: d.ASSIGNED_BY_ID,
      hasReminder: dealsWithPendingReminder.has(d.ID)
    });
    
    const devisSigneList = devisSigne.map(mapDeal).sort((a, b) => b.daysSinceContact - a.daysSinceContact);
    const avanceRecuList = avanceRecu.map(mapDeal).sort((a, b) => b.daysInStage - a.daysInStage);
    const billetRecuList = billetRecu.map(mapDeal).sort((a, b) => b.daysSinceContact - a.daysSinceContact);
    
    // Devis signés en danger (>7j sans contact ET pas de relance planifiée)
    const devisEnDanger = devisSigneList.filter(d => d.daysSinceContact > 7 && !d.hasReminder);
    const devisAvecRelance = devisSigneList.filter(d => d.daysSinceContact > 7 && d.hasReminder);
    const caDevisEnDanger = devisEnDanger.reduce((sum, d) => sum + d.opportunity, 0);
    
    // Avances anciennes (>30j en étape ET pas de relance planifiée)
    const avancesAnciennes = avanceRecuList.filter(d => d.daysInStage > 30 && !d.hasReminder);
    const avancesAvecRelance = avanceRecuList.filter(d => d.daysInStage > 30 && d.hasReminder);
    const caAvancesAnciennes = avancesAnciennes.reduce((sum, d) => sum + d.opportunity, 0);
    
    // CA total des deals chauds
    const caDevisSigne = devisSigneList.reduce((sum, d) => sum + d.opportunity, 0);
    const caAvanceRecu = avanceRecuList.reduce((sum, d) => sum + d.opportunity, 0);
    const caBilletRecu = billetRecuList.reduce((sum, d) => sum + d.opportunity, 0);
    
    // Par commercial
    const byCommercial = {};
    [...devisSigneList, ...avanceRecuList, ...billetRecuList].forEach(d => {
      if (!byCommercial[d.commercialId]) {
        byCommercial[d.commercialId] = {
          name: d.commercial,
          devisSigne: 0,
          avanceRecu: 0,
          billetRecu: 0,
          caTotal: 0,
          enDanger: 0
        };
      }
      if (d.stageId && d.stageId.includes('PREPAYMENT_INVOICE')) {
        byCommercial[d.commercialId].devisSigne++;
        if (d.daysSinceContact > 7 && !d.hasReminder) byCommercial[d.commercialId].enDanger++;
      } else if (d.stageId && d.stageId.includes('FINAL_INVOICE')) {
        byCommercial[d.commercialId].avanceRecu++;
      } else if (d.stageId && d.stageId.includes('EXECUTING')) {
        byCommercial[d.commercialId].billetRecu++;
      }
      byCommercial[d.commercialId].caTotal += d.opportunity;
    });
    
    return {
      devisSigne: {
        total: devisSigneList.length,
        enDanger: devisEnDanger.length,
        avecRelance: devisAvecRelance.length,
        ca: caDevisSigne,
        caEnDanger: caDevisEnDanger,
        list: devisSigneList
      },
      avanceRecu: {
        total: avanceRecuList.length,
        anciennes: avancesAnciennes.length,
        avecRelance: avancesAvecRelance.length,
        ca: caAvanceRecu,
        caAnciennes: caAvancesAnciennes,
        list: avanceRecuList
      },
      billetRecu: {
        total: billetRecuList.length,
        ca: caBilletRecu,
        list: billetRecuList
      },
      totals: {
        deals: devisSigneList.length + avanceRecuList.length + billetRecuList.length,
        ca: caDevisSigne + caAvanceRecu + caBilletRecu,
        enDanger: devisEnDanger.length + avancesAnciennes.length,
        caEnDanger: caDevisEnDanger + caAvancesAnciennes,
        avecRelance: devisAvecRelance.length + avancesAvecRelance.length
      },
      byCommercial
    };
  }, [rawDeals, rawActivities, dealsWithPendingReminder, getUserName]);

  // ====== ALGORITHME D'ALLOCATION DE LEADS ======
  const allocationStats = useMemo(() => {
    const now = new Date();
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    
    // Liste des IDs utilisateurs actifs (chargés par l'API)
    const activeUserIds = new Set(rawUsers.map(u => u.ID));
    
    // Filtrer les données des 60 derniers jours
    const recentLeads = rawLeads.filter(l => l.DATE_CREATE && new Date(l.DATE_CREATE) >= sixtyDaysAgo);
    const recentDeals = rawDeals.filter(d => 
      d.DATE_CREATE && new Date(d.DATE_CREATE) >= sixtyDaysAgo &&
      d.STAGE_ID && !d.STAGE_ID.startsWith('C1:') && !d.STAGE_ID.startsWith('C5:')
    );
    
    // Index des activités par lead et par deal
    const activitiesByLead = {};
    const activitiesByDeal = {};
    rawActivities.forEach(a => {
      if (a.OWNER_TYPE_ID === '1') {
        if (!activitiesByLead[a.OWNER_ID]) activitiesByLead[a.OWNER_ID] = [];
        activitiesByLead[a.OWNER_ID].push(a);
      } else if (a.OWNER_TYPE_ID === '2') {
        if (!activitiesByDeal[a.OWNER_ID]) activitiesByDeal[a.OWNER_ID] = [];
        activitiesByDeal[a.OWNER_ID].push(a);
      }
    });
    
    // Calculer les stats par commercial
    const commercialAllocation = {};
    
    // Commerciaux exclus de l'Allocation (pas de campagnes pub)
    const excludeFromAllocation = ['Wassim', 'Houda', 'Yosra'];
    const shouldExcludeFromAllocation = (name) => {
      if (!name) return true;
      return excludeFromAllocation.some(excluded => name.toLowerCase().includes(excluded.toLowerCase()));
    };
    
    // Identifier les commerciaux actifs (ceux qui ont des leads ou deals récents ET sont dans rawUsers)
    const activeCommercialIds = new Set();
    recentLeads.forEach(l => {
      if (l.ASSIGNED_BY_ID && activeUserIds.has(l.ASSIGNED_BY_ID) && !shouldExcludeFromStats(getUserName(l.ASSIGNED_BY_ID)) && !shouldExcludeFromAllocation(getUserName(l.ASSIGNED_BY_ID))) {
        activeCommercialIds.add(l.ASSIGNED_BY_ID);
      }
    });
    recentDeals.forEach(d => {
      if (d.ASSIGNED_BY_ID && activeUserIds.has(d.ASSIGNED_BY_ID) && !shouldExcludeFromStats(getUserName(d.ASSIGNED_BY_ID)) && !shouldExcludeFromAllocation(getUserName(d.ASSIGNED_BY_ID))) {
        activeCommercialIds.add(d.ASSIGNED_BY_ID);
      }
    });
    
    activeCommercialIds.forEach(commercialId => {
      const name = getUserName(commercialId);
      if (shouldExcludeFromStats(name)) return;
      if (shouldExcludeFromAllocation(name)) return;
      
      // Leads du commercial (60 derniers jours)
      const leads = recentLeads.filter(l => l.ASSIGNED_BY_ID === commercialId);
      const deals = recentDeals.filter(d => d.ASSIGNED_BY_ID === commercialId);
      
      // === 1. TAUX DE CLOSING ===
      const converted = leads.filter(l => l.STATUS_ID === 'CONVERTED').length;
      const wonDeals = deals.filter(d => d.STAGE_ID && d.STAGE_ID.includes('WON'));
      const avanceDeals = deals.filter(d => d.STAGE_ID && d.STAGE_ID.includes('FINAL_INVOICE') && !d.STAGE_ID.includes('APOLOGY'));
      const ventes = wonDeals.length + avanceDeals.length;
      const txClosing = converted > 0 ? (ventes / converted) * 100 : 0;
      
      // Score closing (35 pts max) - objectif 15%
      const scoreClosing = Math.min(35, (txClosing / 15) * 35);
      
      // === 2. DÉLAI MOYEN 1ER CONTACT ===
      const leadsWithFirstContact = leads.map(l => {
        const activities = activitiesByLead[l.ID] || [];
        if (activities.length === 0) return null;
        const firstActivity = activities.sort((a, b) => new Date(a.CREATED) - new Date(b.CREATED))[0];
        if (!firstActivity || !l.DATE_CREATE) return null;
        const delay = (new Date(firstActivity.CREATED) - new Date(l.DATE_CREATE)) / (1000 * 60 * 60 * 24);
        return delay;
      }).filter(d => d !== null && d >= 0);
      
      const avgDelaiContact = leadsWithFirstContact.length > 0 
        ? leadsWithFirstContact.reduce((a, b) => a + b, 0) / leadsWithFirstContact.length 
        : 999;
      
      // Score réactivité (25 pts max)
      let scoreReactivite = 0;
      if (avgDelaiContact <= 1) scoreReactivite = 25;
      else if (avgDelaiContact <= 2) scoreReactivite = 20;
      else if (avgDelaiContact <= 3) scoreReactivite = 15;
      else if (avgDelaiContact <= 5) scoreReactivite = 10;
      else scoreReactivite = 0;
      
      // === 3. % LEADS EN RETARD (>3j sans contact) ===
      const leadsEnCours = rawLeads.filter(l => 
        l.ASSIGNED_BY_ID === commercialId &&
        l.STATUS_ID && l.STATUS_ID !== 'CONVERTED' && l.STATUS_ID !== 'JUNK'
      );
      const leadsEnRetard = leadsEnCours.filter(l => {
        // Utiliser LAST_ACTIVITY_TIME si valide, sinon DATE_MODIFY
        const lastActivity = (l.LAST_ACTIVITY_TIME && l.LAST_ACTIVITY_TIME !== '') 
          ? l.LAST_ACTIVITY_TIME 
          : l.DATE_MODIFY;
        if (!lastActivity) return true;
        const days = (now - new Date(lastActivity)) / (1000 * 60 * 60 * 24);
        return days > 3;
      });
      const pctRetard = leadsEnCours.length > 0 ? (leadsEnRetard.length / leadsEnCours.length) * 100 : 0;
      
      // Score saturation (20 pts max)
      const scoreSaturation = Math.max(0, 20 - (pctRetard * 0.4));
      
      // === 4. % LEADS JAMAIS CONTACTÉS ===
      const leadsJamaisContactes = leads.filter(l => {
        const activities = activitiesByLead[l.ID] || [];
        return activities.length === 0 && !l.LAST_ACTIVITY_TIME;
      });
      const pctJamaisContactes = leads.length > 0 ? (leadsJamaisContactes.length / leads.length) * 100 : 0;
      
      // Score gaspillage (15 pts max)
      const scoreGaspillage = Math.max(0, 15 - (pctJamaisContactes * 0.3));
      
      // === 5. FICHES TOUCHÉES PAR JOUR (dédoublonné par patient) ===
      const activitesRecentes = rawActivities.filter(a => 
        a.RESPONSIBLE_ID === commercialId &&
        a.CREATED && new Date(a.CREATED) >= sixtyDaysAgo
      );
      // Dédoublonner par patient (OWNER_TYPE_ID + OWNER_ID)
      const fichesUniques = new Set();
      activitesRecentes.forEach(a => fichesUniques.add(`${a.OWNER_TYPE_ID}-${a.OWNER_ID}`));
      const joursOuvres = 40; // ~60 jours calendaires = ~40 jours ouvrés
      const fichesParJour = fichesUniques.size / joursOuvres;
      
      // Score volume (5 pts max) - objectif 15 fiches/jour
      const scoreVolume = Math.min(5, (fichesParJour / 15) * 5);
      
      // === SCORE TOTAL ===
      const scoreTotal = Math.round(scoreClosing + scoreReactivite + scoreSaturation + scoreGaspillage + scoreVolume);
      
      // === CAPACITÉ DISPONIBLE ===
      const seuilRetard = 10; // Max leads en retard toléré
      const capacite = Math.max(0, seuilRetard - leadsEnRetard.length);
      
      // === RECOMMANDATION ===
      let recommandation = 'stop';
      let couleur = 'red';
      let leadsParSemaine = 0;
      
      if (scoreTotal >= 70 && capacite >= 5) {
        recommandation = 'prioritaire';
        couleur = 'green';
        leadsParSemaine = 15 + Math.floor((scoreTotal - 70) / 10) * 5; // 15-20
      } else if (scoreTotal >= 60 && capacite >= 3) {
        recommandation = 'normal';
        couleur = 'blue';
        leadsParSemaine = 8 + Math.floor((scoreTotal - 60) / 10) * 4; // 8-12
      } else if (scoreTotal >= 50 && capacite >= 2) {
        recommandation = 'limite';
        couleur = 'yellow';
        leadsParSemaine = 3 + Math.floor((scoreTotal - 50) / 10) * 2; // 3-5
      } else {
        recommandation = 'stop';
        couleur = 'red';
        leadsParSemaine = 0;
      }
      
      commercialAllocation[commercialId] = {
        id: commercialId,
        name,
        // Métriques brutes
        leadsRecus: leads.length,
        converted,
        ventes,
        txClosing: Math.round(txClosing * 10) / 10,
        avgDelaiContact: avgDelaiContact === 999 ? null : Math.round(avgDelaiContact * 10) / 10,
        leadsEnCours: leadsEnCours.length,
        leadsEnRetard: leadsEnRetard.length,
        pctRetard: Math.round(pctRetard),
        leadsJamaisContactes: leadsJamaisContactes.length,
        pctJamaisContactes: Math.round(pctJamaisContactes),
        fichesParJour: Math.round(fichesParJour * 10) / 10,
        // Scores détaillés
        scoreClosing: Math.round(scoreClosing),
        scoreReactivite: Math.round(scoreReactivite),
        scoreSaturation: Math.round(scoreSaturation),
        scoreGaspillage: Math.round(scoreGaspillage),
        scoreVolume: Math.round(scoreVolume),
        // Résultats
        scoreTotal,
        capacite,
        recommandation,
        couleur,
        leadsParSemaine
      };
    });
    
    // Convertir en array et trier par score
    const commerciaux = Object.values(commercialAllocation).sort((a, b) => b.scoreTotal - a.scoreTotal);
    
    // Calculs globaux
    const totalLeadsParSemaine = commerciaux.reduce((sum, c) => sum + c.leadsParSemaine, 0);
    const budgetHebdo = totalLeadsParSemaine * 6; // CPL = 6€
    const budgetMensuel = budgetHebdo * 4;
    
    // Répartition par recommandation
    const repartition = {
      prioritaire: commerciaux.filter(c => c.recommandation === 'prioritaire'),
      normal: commerciaux.filter(c => c.recommandation === 'normal'),
      limite: commerciaux.filter(c => c.recommandation === 'limite'),
      stop: commerciaux.filter(c => c.recommandation === 'stop')
    };
    
    return {
      commerciaux,
      totalLeadsParSemaine,
      budgetHebdo,
      budgetMensuel,
      repartition,
      periode: '60 derniers jours',
      cpl: 6
    };
  }, [rawLeads, rawDeals, rawActivities, getUserName]);
  const dailyStats = useMemo(() => {
    const dateStr = selectedDayDate;
    
    const isSameDay = (d1, d2) => {
      if (!d1) return false;
      const date1 = new Date(d1);
      return date1.toISOString().slice(0, 10) === d2;
    };
    
    // Filtrer les deals commerciaux (hors C1/C5)
    const commercialDeals = rawDeals.filter(d => !d.STAGE_ID || (!d.STAGE_ID.startsWith('C1:') && !d.STAGE_ID.startsWith('C5:')));
    
    // ACTIVITÉS CRÉÉES = TRAVAIL RÉEL
    // On compte les activités créées ce jour-là par commercial (appels, emails, tâches, RDV)
    // EXCLURE les to-do automatiques "Contacter le client" (PROVIDER_ID = CRM_TODO)
    const activitiesCreatedToday = rawActivities.filter(a => {
      if (!isSameDay(a.CREATED, dateStr)) return false;
      // Exclure les to-do automatiques
      if (a.PROVIDER_ID === 'CRM_TODO') return false;
      return true;
    });
    
    // Nouveaux leads créés aujourd'hui (vrais nouveaux leads, pas modifiés)
    const leadsCreated = rawLeads.filter(l => isSameDay(l.DATE_CREATE, dateStr));
    
    // Deals créés aujourd'hui (conversions)
    const dealsCreated = commercialDeals.filter(d => isSameDay(d.DATE_CREATE, dateStr));
    
    // Won et Avance basés sur DATE_MODIFY (changement d'étape)
    const wonToday = commercialDeals.filter(d => d.STAGE_ID && d.STAGE_ID.includes('WON') && isSameDay(d.DATE_MODIFY, dateStr));
    const avanceToday = commercialDeals.filter(d => d.STAGE_ID && d.STAGE_ID.includes('FINAL_INVOICE') && !d.STAGE_ID.includes('APOLOGY') && isSameDay(d.DATE_MODIFY, dateStr));
    const caWonToday = wonToday.reduce((sum, d) => sum + parseFloat(d.OPPORTUNITY || 0), 0);
    
    // PRÉVU - Activités planifiées pour ce jour
    // On garde les CRM_TODO ici car elles représentent quand même une relance à faire
    // (on les exclut seulement du compteur "travail réel")
    const activitiesPlanned = rawActivities.filter(a => isSameDay(a.DEADLINE, dateStr));
    
    // Fonction pour vérifier si une activité prévue est "effectivement faite"
    // = completed OU une nouvelle activité a été créée sur ce lead/deal ce jour
    const isActivityEffectivelyDone = (activity) => {
      if (activity.COMPLETED === 'true') return true;
      
      // Vérifier si une activité a été CRÉÉE aujourd'hui sur ce même lead/deal par le même commercial
      const hasNewActivityToday = activitiesCreatedToday.some(a => 
        a.OWNER_ID === activity.OWNER_ID && 
        a.OWNER_TYPE_ID === activity.OWNER_TYPE_ID &&
        a.RESPONSIBLE_ID === activity.RESPONSIBLE_ID
      );
      
      return hasNewActivityToday;
    };
    
    const activitiesPlannedDone = activitiesPlanned.filter(a => isActivityEffectivelyDone(a));
    const activitiesPlannedPending = activitiesPlanned.filter(a => !isActivityEffectivelyDone(a));
    
    // Par commercial - basé sur les ACTIVITÉS CRÉÉES (travail réel)
    const byCommercial = {};
    const allUserIds = new Set([
      ...activitiesCreatedToday.map(a => a.RESPONSIBLE_ID),
      ...activitiesPlanned.map(a => a.RESPONSIBLE_ID),
      ...leadsCreated.map(l => l.ASSIGNED_BY_ID),
      ...wonToday.map(d => d.ASSIGNED_BY_ID)
    ]);
    
    allUserIds.forEach(userId => {
      if (!userId) return;
      
      // Trouver l'utilisateur pour vérifier si c'est un compte test
      const user = rawUsers.find(u => u.ID === userId);
      const name = getUserName(userId);
      
      // Exclure: Inconnu, test, admin, etc.
      if (name === 'Inconnu') return;
      if (shouldExcludeFromStats(name)) return;
      
      // Exclure aussi si le nom ou prénom contient "test"
      if (user) {
        const fullName = ((user.NAME || '') + ' ' + (user.LAST_NAME || '')).toLowerCase();
        if (fullName.includes('test') || fullName.includes('admin') || fullName.includes('demo')) return;
      }
      
      // Activités créées par ce commercial aujourd'hui = TRAVAIL RÉEL
      const userActivitiesCreated = activitiesCreatedToday.filter(a => a.RESPONSIBLE_ID === userId);
      
      // PATIENTS TRAVAILLÉS = dédoublonné par patient (OWNER_ID)
      const patientsTravailles = new Set();
      userActivitiesCreated.forEach(a => {
        patientsTravailles.add(`${a.OWNER_TYPE_ID}-${a.OWNER_ID}`);
      });
      
      // Détail par type d'activité avec séparation entrant/sortant
      // DIRECTION: 1 = entrant, 2 = sortant
      const userAppelsOut = userActivitiesCreated.filter(a => a.TYPE_ID === '2' && a.DIRECTION === '2').length;
      const userAppelsIn = userActivitiesCreated.filter(a => a.TYPE_ID === '2' && a.DIRECTION === '1').length;
      const userAppels = userActivitiesCreated.filter(a => a.TYPE_ID === '2').length;
      
      const userEmailsOut = userActivitiesCreated.filter(a => a.TYPE_ID === '4' && a.DIRECTION === '2').length;
      const userEmailsIn = userActivitiesCreated.filter(a => a.TYPE_ID === '4' && a.DIRECTION === '1').length;
      const userEmails = userActivitiesCreated.filter(a => a.TYPE_ID === '4').length;
      
      const userTaches = userActivitiesCreated.filter(a => a.TYPE_ID === '3' || a.TYPE_ID === '6').length;
      const userRdv = userActivitiesCreated.filter(a => a.TYPE_ID === '1').length;
      
      // Nouveaux leads assignés à ce commercial
      const userLeadsCreated = leadsCreated.filter(l => l.ASSIGNED_BY_ID === userId);
      
      // Deals créés (conversions)
      const userDealsCreated = dealsCreated.filter(d => d.ASSIGNED_BY_ID === userId);
      
      // Won
      const userWon = wonToday.filter(d => d.ASSIGNED_BY_ID === userId);
      const userCA = userWon.reduce((sum, d) => sum + parseFloat(d.OPPORTUNITY || 0), 0);
      
      // Activités prévues - DÉDOUBLONNER par patient
      const userActivitiesPlanned = activitiesPlanned.filter(a => a.RESPONSIBLE_ID === userId);
      const patientsPlanned = new Set();
      userActivitiesPlanned.forEach(a => patientsPlanned.add(`${a.OWNER_TYPE_ID}-${a.OWNER_ID}`));
      
      const userActivitiesDone = userActivitiesPlanned.filter(a => isActivityEffectivelyDone(a));
      const patientsDone = new Set();
      userActivitiesDone.forEach(a => patientsDone.add(`${a.OWNER_TYPE_ID}-${a.OWNER_ID}`));
      
      const userActivitiesPending = userActivitiesPlanned.filter(a => !isActivityEffectivelyDone(a));
      const patientsPending = new Set();
      userActivitiesPending.forEach(a => patientsPending.add(`${a.OWNER_TYPE_ID}-${a.OWNER_ID}`));
      
      byCommercial[userId] = {
        id: userId,
        name,
        // PATIENTS TRAVAILLÉS = dédoublonné par patient
        patientsTravailles: patientsTravailles.size,
        appels: userAppels,
        appelsOut: userAppelsOut,
        appelsIn: userAppelsIn,
        emails: userEmails,
        emailsOut: userEmailsOut,
        emailsIn: userEmailsIn,
        taches: userTaches,
        rdv: userRdv,
        // Autres métriques
        leadsCreated: userLeadsCreated.length,
        dealsCreated: userDealsCreated.length,
        won: userWon.length,
        ca: userCA,
        // Prévisions - DÉDOUBLONNÉ par patient
        patientsPlanned: patientsPlanned.size,
        patientsDone: patientsDone.size,
        patientsPending: patientsPending.size,
        // DÉDOUBLONNER les relances par patient (OWNER_ID unique)
        pendingList: (() => {
          const seenOwners = new Set();
          return userActivitiesPending
            .filter(a => {
              const key = `${a.OWNER_TYPE_ID}-${a.OWNER_ID}`;
              if (seenOwners.has(key)) return false;
              seenOwners.add(key);
              return true;
            })
            .map(a => {
              const ownerType = a.OWNER_TYPE_ID === '1' ? 'lead' : 'deal';
              const owner = ownerType === 'lead' 
                ? rawLeads.find(l => l.ID === a.OWNER_ID)
                : commercialDeals.find(d => d.ID === a.OWNER_ID);
              return {
                id: a.ID,
                subject: a.SUBJECT || 'Sans sujet',
                type: a.TYPE_ID,
                ownerType,
                ownerName: owner?.TITLE || owner?.NAME || 'Inconnu',
                ownerId: a.OWNER_ID,
                deadline: a.DEADLINE
              };
            });
        })()
      };
    });
    
    // Liste des activités en retard (prévues mais non faites)
    // DÉDOUBLONNER par patient (OWNER_ID unique) pour éviter les doublons task + to-do
    const seenOwnersGlobal = new Set();
    const pendingActivitiesList = activitiesPlannedPending
      .filter(a => {
        const key = `${a.OWNER_TYPE_ID}-${a.OWNER_ID}`;
        if (seenOwnersGlobal.has(key)) return false;
        seenOwnersGlobal.add(key);
        return true;
      })
      .map(a => {
      const ownerType = a.OWNER_TYPE_ID === '1' ? 'lead' : 'deal';
      const owner = ownerType === 'lead' 
        ? rawLeads.find(l => l.ID === a.OWNER_ID)
        : commercialDeals.find(d => d.ID === a.OWNER_ID);
      return {
        id: a.ID,
        subject: a.SUBJECT || 'Sans sujet',
        type: a.TYPE_ID,
        ownerType,
        ownerName: owner?.TITLE || owner?.NAME || 'Inconnu',
        ownerId: a.OWNER_ID,
        deadline: a.DEADLINE,
        commercial: getUserName(a.RESPONSIBLE_ID),
        commercialId: a.RESPONSIBLE_ID
      };
    }).sort((a, b) => a.commercial.localeCompare(b.commercial));
    
    // Calcul des totaux dédoublonnés
    const totalPatientsTravailles = new Set();
    activitiesCreatedToday.forEach(a => totalPatientsTravailles.add(`${a.OWNER_TYPE_ID}-${a.OWNER_ID}`));
    
    const totalPatientsPlanned = new Set();
    activitiesPlanned.forEach(a => totalPatientsPlanned.add(`${a.OWNER_TYPE_ID}-${a.OWNER_ID}`));
    
    const totalPatientsDone = new Set();
    activitiesPlannedDone.forEach(a => totalPatientsDone.add(`${a.OWNER_TYPE_ID}-${a.OWNER_ID}`));
    
    const totalPatientsPending = new Set();
    activitiesPlannedPending.forEach(a => totalPatientsPending.add(`${a.OWNER_TYPE_ID}-${a.OWNER_ID}`));
    
    return {
      date: dateStr,
      realized: {
        patientsTravailles: totalPatientsTravailles.size,
        leadsCreated: leadsCreated.length,
        dealsCreated: dealsCreated.length,
        won: wonToday.length,
        avance: avanceToday.length,
        caWon: caWonToday
      },
      planned: {
        total: totalPatientsPlanned.size,
        done: totalPatientsDone.size,
        pending: totalPatientsPending.size,
        pendingList: pendingActivitiesList
      },
      byCommercial: Object.values(byCommercial).sort((a, b) => 
        b.patientsTravailles - a.patientsTravailles
      )
    };
  }, [selectedDayDate, rawLeads, rawDeals, rawActivities, getUserName]);

  // === DISCIPLINE 7 JOURS ===
  const disciplineStats = useMemo(() => {
    if (!rawActivities.length) return [];
    
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    
    // 7 derniers jours ouvrés (on prend 10 jours calendaires pour couvrir les weekends)
    const days = [];
    for (let i = 1; i <= 10; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) days.push(d.toISOString().slice(0, 10));
      if (days.length >= 7) break;
    }
    if (days.length === 0) return [];
    
    const firstDay = days[days.length - 1];
    const lastDay = days[0];
    
    // Activités prévues sur la période (deadline dans les 7 derniers jours ouvrés)
    // On garde les CRM_TODO car elles représentent des relances à faire
    const plannedActivities = rawActivities.filter(a => {
      if (!a.DEADLINE) return false;
      const dl = a.DEADLINE.slice(0, 10);
      return dl >= firstDay && dl <= lastDay;
    });
    
    // Activités créées sur la période (EXCLURE les to-do automatiques)
    const createdActivities = rawActivities.filter(a => {
      if (!a.CREATED) return false;
      const cr = a.CREATED.slice(0, 10);
      if (cr < firstDay || cr > lastDay) return false;
      // Exclure les to-do automatiques "Contacter le client"
      if (a.PROVIDER_ID === 'CRM_TODO') return false;
      return true;
    });
    
    // Commerciaux actifs
    const activeUserIds = new Set();
    rawUsers.forEach(u => {
      if (u.ACTIVE === 'true' || u.ACTIVE === true) {
        const name = getUserName(u.ID);
        if (!shouldExcludeFromStats(name) && name !== 'Inconnu') {
          activeUserIds.add(u.ID);
        }
      }
    });
    
    const results = [];
    
    activeUserIds.forEach(userId => {
      const name = getUserName(userId);
      
      // Relances prévues pour ce commercial
      const userPlanned = plannedActivities.filter(a => a.RESPONSIBLE_ID === userId);
      if (userPlanned.length === 0) return; // Pas de relances prévues = pas pertinent
      
      // Relances traitées (completed = true)
      const userDone = userPlanned.filter(a => a.COMPLETED === 'true');
      
      // Relances non traitées
      const userPending = userPlanned.filter(a => a.COMPLETED !== 'true');
      
      // Taux de traitement
      const txTraitement = userPlanned.length > 0 ? (userDone.length / userPlanned.length) * 100 : 0;
      
      // Activités créées (travail réel)
      const userCreated = createdActivities.filter(a => a.RESPONSIBLE_ID === userId);
      
      // Détail par jour - pour détecter les jours d'accumulation
      const joursAvecRetard = [];
      days.forEach(day => {
        const dayPlanned = userPlanned.filter(a => a.DEADLINE && a.DEADLINE.slice(0, 10) === day);
        const dayDone = dayPlanned.filter(a => a.COMPLETED === 'true');
        const dayPending = dayPlanned.filter(a => a.COMPLETED !== 'true');
        if (dayPending.length > 0) {
          joursAvecRetard.push({ date: day, pending: dayPending.length, planned: dayPlanned.length });
        }
      });
      
      // Premier jour de retard (le plus ancien)
      const premierRetard = joursAvecRetard.length > 0 
        ? joursAvecRetard.sort((a, b) => a.date.localeCompare(b.date))[0].date
        : null;
      
      // Jours d'accumulation consécutifs
      const joursAccumulation = joursAvecRetard.length;
      
      // CA en danger (deals avec relances non traitées)
      const dealsEnDanger = new Set();
      let caEnDanger = 0;
      userPending.forEach(a => {
        if (a.OWNER_TYPE_ID === '2' && !dealsEnDanger.has(a.OWNER_ID)) {
          dealsEnDanger.add(a.OWNER_ID);
          const deal = rawDeals.find(d => d.ID === a.OWNER_ID);
          if (deal) caEnDanger += parseFloat(deal.OPPORTUNITY || 0);
        }
      });
      
      results.push({
        id: userId,
        name,
        planned: userPlanned.length,
        done: userDone.length,
        pending: userPending.length,
        txTraitement: Math.round(txTraitement),
        created: userCreated.length,
        joursAccumulation,
        premierRetard,
        dealsEnDanger: dealsEnDanger.size,
        caEnDanger,
        // Indicateur de santé
        sante: txTraitement >= 90 ? 'excellent' : txTraitement >= 70 ? 'bon' : txTraitement >= 50 ? 'moyen' : 'critique'
      });
    });
    
    return results.sort((a, b) => a.txTraitement - b.txTraitement); // Pires en premier
  }, [rawActivities, rawDeals, rawUsers, getUserName]);

  const exportRetards = (commercialId, type = 'leads') => {
    const data = type === 'leads' ? alertsLeads.byCommercial[commercialId] : alertsDeals.byCommercial[commercialId];
    if (!data) return;
    
    const items = type === 'leads' ? data.leads : data.deals;
    const csv = [
      type === 'leads' 
        ? ['ID', 'Nom', 'Etape', 'Jours sans activite', 'Telephone', 'Source'].join(';')
        : ['ID', 'Nom', 'Etape', 'Jours sans activite', 'Montant'].join(';'),
      ...items.map(item => type === 'leads'
        ? [item.id, item.title, item.status, item.daysAgo, item.phone, item.source].join(';')
        : [item.id, item.title, item.stage, item.daysAgo, item.opportunity].join(';')
      )
    ].join('\n');
    
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `retards_${type}_${data.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    const csv = [
      ['Commercial', 'Leads', 'Bad', 'Convertis', 'Won', 'Avance', 'Tx Conv', 'Tx Closing', 'CA'].join(';'),
      ...commercialStats.map(c => [c.name, c.leads, c.bad, c.converted, c.won, c.avance, formatPercent(c.txConv), formatPercent(c.txClosing), c.revenue].join(';'))
    ].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `doctour_stats_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export CSV des anomalies qualité
  const exportQualityCSV = () => {
    const csv = [
      ['ID', 'Nom', 'Étape', 'Montant', 'Date création', 'Commercial', 'Statut'].join(';'),
      ...qualityStats.dealsWithoutLead.list.map(d => [
        d.id, 
        d.title, 
        d.stage, 
        d.opportunity || 0, 
        formatDate(d.dateCreate), 
        d.commercial,
        d.stageId && d.stageId.includes('WON') ? 'WON - CRITIQUE' : d.stageId && d.stageId.includes('LOSE') ? 'PERDU' : 'EN COURS'
      ].join(';'))
    ].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deals_sans_lead_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Envoyer rapport qualité par mail à Yosra
  const sendQualityReportToYosra = () => {
    const today = new Date().toLocaleDateString('fr-FR');
    const wonList = qualityStats.dealsWithoutLead.list
      .filter(d => d.stageId && d.stageId.includes('WON'))
      .map(d => `  • ${d.title} (ID: ${d.id}) - ${formatCurrency(d.opportunity)} - ${d.commercial}`)
      .join('%0A');
    const inProgressList = qualityStats.dealsWithoutLead.list
      .filter(d => d.stageId && !d.stageId.includes('WON') && !d.stageId.includes('LOSE') && !d.stageId.includes('APOLOGY'))
      .map(d => `  • ${d.title} (ID: ${d.id}) - ${d.stage} - ${d.commercial}`)
      .join('%0A');
    
    const subject = encodeURIComponent(`[DOCTOUR Analytics] Rapport Qualité Données - ${today}`);
    const body = encodeURIComponent(`Bonjour Yosra,

Voici le rapport qualité des données du ${today} :

📊 RÉSUMÉ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Total deals sans lead source : ${qualityStats.dealsWithoutLead.total}
• 🚨 Won sans lead (CRITIQUE) : ${qualityStats.dealsWithoutLead.won}
• ⏳ En cours sans lead : ${qualityStats.dealsWithoutLead.inProgress}
• Perdus sans lead : ${qualityStats.dealsWithoutLead.lost}

🚨 DEALS WON SANS LEAD (CRITIQUE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ces deals ont été gagnés mais n'ont pas de lead source associé, ce qui pose un problème de traçabilité :
${wonList || '  Aucun'}

⏳ DEALS EN COURS SANS LEAD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ces deals actifs devraient être rattachés à un lead :
${inProgressList || '  Aucun'}

💡 ACTIONS RECOMMANDÉES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Vérifier et corriger les deals Won sans lead dans Bitrix24
2. Rappeler aux commerciaux de toujours créer un deal depuis un lead
3. Rattacher les deals en cours à leurs leads source

Le fichier CSV détaillé est disponible dans l'onglet "Qualité" du dashboard.

Cordialement,
DOCTOUR Analytics`);
    
    // Ouvre le client mail par défaut
    window.location.href = `mailto:yosra@doctour.fr?subject=${subject}&body=${body}`;
  };

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'aujourdhui', label: 'Aujourd\'hui', icon: '📅', badge: dailyStats.planned.pending > 0 ? dailyStats.planned.pending : null },
    { id: 'commerciaux', label: 'Commerciaux', icon: '👥' },
    { id: 'sources', label: 'Sources', icon: '🏷️' },
    { id: 'mensuel', label: 'Mensuel', icon: '📆' },
    { id: 'chauds', label: 'Chauds', icon: '🔥', badge: hotDealsStats.totals.enDanger > 0 ? hotDealsStats.totals.enDanger : null },
    { id: 'delais', label: 'Delais', icon: '⏱️' },
    { id: 'alerts', label: 'Alertes', icon: '🚨', badge: activitiesLoading ? '⏳' : (alertsLeads.total + alertsDeals.total) },
    { id: 'qualite', label: 'Qualité', icon: '🔍', badge: activitiesLoading ? '⏳' : (qualityStats.dealsWithoutLead.won + qualityStats.dealsWithoutLead.inProgress + qualityStats.dealsWithoutActivity.length + qualityStats.leadsWithoutActivity.length + qualityStats.leadsOrphelins.length + qualityStats.dealsOrphelins.length) },
    { id: 'allocation', label: 'Allocation', icon: '🎯', badge: activitiesLoading ? '⏳' : null }
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto mb-4" />
          <p className="text-slate-400">Chargement des données...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <p className="text-red-400 mb-4">❌ {error}</p>
          <Button onClick={loadData}>Réessayer</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
              DOCTOUR Analytics PRO
            </h1>
            <p className="text-slate-400 text-sm flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${apiStatus === 'live' ? 'bg-emerald-500' : apiStatus === 'error' ? 'bg-red-500' : 'bg-amber-500 animate-pulse'}`} />
              {apiStatus === 'live' ? 'Live' : apiStatus === 'error' ? 'Erreur' : 'Connexion...'} 
              {formatNumber(filteredLeads.length)} leads • {formatNumber(filteredDeals.length)} deals • {formatNumber(rawActivities.length)} activités
              {lastUpdate && ` • MAJ: ${formatDateTime(lastUpdate)}`}
            </p>
            {activitiesLoading && (
              <p className="text-amber-400 text-xs flex items-center gap-1 animate-pulse">
                ⏳ Chargement des activités en cours...
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DateRangePicker presets={PERIOD_PRESETS} selectedPreset={selectedPeriod} onPresetChange={setSelectedPeriod} startDate={customStartDate} endDate={customEndDate} onStartChange={setCustomStartDate} onEndChange={setCustomEndDate} />
            <CommercialSelect commercials={commercialsList} selected={selectedCommercials} onChange={setSelectedCommercials} />
            <Button onClick={exportCSV} variant="secondary" size="sm">📥 CSV</Button>
            <Button onClick={syncRapide} disabled={isAnySyncRunning} variant="success" size="sm" title="Sync Users + Sources + Leads + Deals (~2-3 min)">
              {syncingRapide ? '⏳' : '🔄'} Rapide
            </Button>
            <Button onClick={syncActivites} disabled={isAnySyncRunning} variant="secondary" size="sm" title="Sync Activités uniquement (~20-30 min)">
              {syncingActivites ? '⏳' : '📞'} Activités
            </Button>
            <Button onClick={syncDevis} disabled={isAnySyncRunning} variant="secondary" size="sm" title="Sync Devis uniquement (~2-3 min)">
              {syncingDevis ? '⏳' : '📝'} Devis
            </Button>
          </div>
        </div>

        {isAnySyncRunning && (
          <div className="bg-blue-500/20 border border-blue-500/50 rounded-lg p-3 text-blue-300 text-sm">
            ⏳ {syncProgress}
          </div>
        )}

        {rawLeads.length === 0 && !isAnySyncRunning && (
          <div className="bg-amber-500/20 border border-amber-500/50 rounded-lg p-4 text-center">
            <p className="text-amber-300 mb-2">Base de données vide</p>
            <div className="flex gap-2 justify-center">
              <Button onClick={syncRapide} variant="success">🔄 Sync Rapide (Leads + Deals)</Button>
              <Button onClick={syncActivites} variant="secondary">📞 Sync Activités</Button>
            </div>
          </div>
        )}

        <TabNav tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

        {activeTab === 'dashboard' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard icon="📥" label="Leads" value={formatNumber(leadStats.total)} subtext={`${leadStats.todayTotal} aujourd'hui`} color="blue" />
              <KpiCard icon="✅" label="Convertis" value={formatNumber(leadStats.converted)} subtext={`${formatPercent(leadStats.txConv)} tx conv`} color="green" />
              <KpiCard icon="🏆" label="Won" value={formatNumber(dealStats.won)} subtext={formatCurrency(dealStats.revenue)} color="purple" />
              <KpiCard icon="💳" label="Avance" value={formatNumber(dealStats.avance)} subtext={`Total ventes: ${dealStats.ventesAvecAvance}`} color="cyan" />
            </div>
            
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard icon="📈" label="Tx Closing (+Av)" value={formatPercent(dealStats.txClosing)} subtext={`Obj: ${objectifClosing}%`} color={getRateColor(dealStats.txClosing, objectifClosing)} />
              <KpiCard icon="📉" label="Tx Closing (Won)" value={formatPercent(dealStats.txClosingSansAvance)} color="purple" />
              <KpiCard icon="🎯" label="Tx Global (+Av)" value={formatPercent(dealStats.txGlobalAvecAvance)} color="cyan" />
              <KpiCard icon="🚨" label="Alertes" value={alertsLeads.total + alertsDeals.total} subtext={`${alertsLeads.total} leads, ${alertsDeals.total} deals`} color="red" onClick={() => setActiveTab('alerts')} />
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
              <Card title="Top Closers" icon="🏆">
                {topClosers.length === 0 ? (
                  <p className="text-slate-500 text-center py-4">Min 10 convertis requis</p>
                ) : (
                  topClosers.map((c, i) => (
                    <RankingRow key={c.id} rank={i + 1} name={c.name} initials={c.initials} value={formatPercent(c.txClosing)} subValue={`${c.ventesAvecAvance} ventes / ${c.converted} conv`} />
                  ))
                )}
              </Card>
              <Card title="Evolution Mensuelle" icon="📈">
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={monthlyEvolution.slice(-6)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="date" tickFormatter={d => formatMonthYear(d).slice(0, 3)} stroke="#64748b" fontSize={12} />
                    <YAxis stroke="#64748b" fontSize={12} />
                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }} />
                    <Line type="monotone" dataKey="leads" stroke="#3b82f6" name="Leads" strokeWidth={2} />
                    <Line type="monotone" dataKey="ventesAvecAvance" stroke="#10b981" name="Ventes" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            </div>
          </div>
        )}

        {activeTab === 'commerciaux' && (
          <div className="space-y-4">
            <Card title="Performance par Commercial">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-400">
                      <th className="p-2 text-left">Commercial</th>
                      <th className="p-2 text-right">Leads</th>
                      <th className="p-2 text-right">Bad</th>
                      <th className="p-2 text-right">Conv</th>
                      <th className="p-2 text-right">Won</th>
                      <th className="p-2 text-right">Avance</th>
                      <th className="p-2 text-right">Tx Conv</th>
                      <th className="p-2 text-right">Tx Closing</th>
                      <th className="p-2 text-right">Tx Global</th>
                      <th className="p-2 text-right">CA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commercialStats.filter(c => c.leads > 0).map(c => (
                      <tr key={c.id} className="border-b border-slate-800 hover:bg-slate-800/50">
                        <td className="p-2 font-medium flex items-center gap-2">
                          <span className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-xs font-bold">{c.initials}</span>
                          {c.name}
                        </td>
                        <td className="p-2 text-right font-mono">{c.leads}</td>
                        <td className="p-2 text-right font-mono text-red-400">{c.bad}</td>
                        <td className="p-2 text-right font-mono text-emerald-400">{c.converted}</td>
                        <td className="p-2 text-right font-mono text-purple-400">{c.won}</td>
                        <td className="p-2 text-right font-mono text-cyan-400">{c.avance}</td>
                        <td className="p-2 text-right"><Badge color={getRateColor(c.txConv, 40)} size="xs">{formatPercent(c.txConv)}</Badge></td>
                        <td className="p-2 text-right"><Badge color={getRateColor(c.txClosing, objectifClosing)} size="xs">{formatPercent(c.txClosing)}</Badge></td>
                        <td className="p-2 text-right font-mono">{formatPercent(c.txGlobalAvec)}</td>
                        <td className="p-2 text-right font-mono text-cyan-400">{formatCurrency(c.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* DISCIPLINE 7 JOURS */}
            {disciplineStats.length > 0 && (
              <Card title="📊 Discipline — 7 derniers jours ouvrés" icon="🎯">
                <p className="text-slate-400 text-sm mb-3">Taux de traitement des relances planifiées. Les commerciaux avec le plus de retard apparaissent en premier.</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700 text-slate-400">
                        <th className="p-2 text-left">Commercial</th>
                        <th className="p-2 text-right">Prévues</th>
                        <th className="p-2 text-right">Faites</th>
                        <th className="p-2 text-right">En retard</th>
                        <th className="p-2 text-right">% Traitement</th>
                        <th className="p-2 text-right">Activités créées</th>
                        <th className="p-2 text-right">Jours retard</th>
                        <th className="p-2 text-right">Depuis</th>
                        <th className="p-2 text-right">Deals en danger</th>
                        <th className="p-2 text-right">CA en danger</th>
                      </tr>
                    </thead>
                    <tbody>
                      {disciplineStats.map(c => (
                        <tr key={c.id} className={`border-b border-slate-800 hover:bg-slate-800/50 ${c.sante === 'critique' ? 'bg-red-500/5' : ''}`}>
                          <td className="p-2 font-medium flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${c.sante === 'excellent' ? 'bg-emerald-400' : c.sante === 'bon' ? 'bg-blue-400' : c.sante === 'moyen' ? 'bg-amber-400' : 'bg-red-400'}`}></span>
                            {c.name}
                          </td>
                          <td className="p-2 text-right font-mono">{c.planned}</td>
                          <td className="p-2 text-right font-mono text-emerald-400">{c.done}</td>
                          <td className="p-2 text-right font-mono">{c.pending > 0 ? <Badge color="red" size="xs">{c.pending}</Badge> : <span className="text-emerald-400">0</span>}</td>
                          <td className="p-2 text-right">
                            <Badge color={c.txTraitement >= 90 ? 'green' : c.txTraitement >= 70 ? 'blue' : c.txTraitement >= 50 ? 'yellow' : 'red'} size="xs">
                              {c.txTraitement}%
                            </Badge>
                          </td>
                          <td className="p-2 text-right font-mono text-cyan-400">{c.created}</td>
                          <td className="p-2 text-right">{c.joursAccumulation > 0 ? <Badge color={c.joursAccumulation >= 3 ? 'red' : 'orange'} size="xs">{c.joursAccumulation}j</Badge> : <span className="text-emerald-400">✓</span>}</td>
                          <td className="p-2 text-right text-slate-400">{c.premierRetard ? new Date(c.premierRetard).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : '-'}</td>
                          <td className="p-2 text-right font-mono">{c.dealsEnDanger > 0 ? <Badge color="orange" size="xs">{c.dealsEnDanger}</Badge> : '-'}</td>
                          <td className="p-2 text-right font-mono text-red-400">{c.caEnDanger > 0 ? formatCurrency(c.caEnDanger) : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex gap-4 mt-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400"></span> ≥90% Excellent</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400"></span> ≥70% Bon</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400"></span> ≥50% Moyen</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400"></span> &lt;50% Critique</span>
                </div>
              </Card>
            )}
          </div>
        )}

        {activeTab === 'sources' && (
          <Card title="Top Sources (min 10 convertis)">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-700 text-slate-400"><th className="p-2 text-left">Source</th><th className="p-2 text-left">Categorie</th><th className="p-2 text-right">Leads</th><th className="p-2 text-right">Conv</th><th className="p-2 text-right">Won</th><th className="p-2 text-right">Avance</th><th className="p-2 text-right">Tx Closing</th></tr></thead>
                <tbody>
                  {sourceStats.filter(s => s.converted >= 10).sort((a, b) => b.txClosing - a.txClosing).slice(0, 20).map((s) => (
                    <tr key={s.sourceId} className="border-b border-slate-800 hover:bg-slate-800/50">
                      <td className="p-2 font-medium max-w-[250px] truncate">{s.source}</td>
                      <td className="p-2"><Badge color="blue" size="xs">{s.category}</Badge></td>
                      <td className="p-2 text-right font-mono">{s.leads}</td>
                      <td className="p-2 text-right font-mono text-emerald-400">{s.converted}</td>
                      <td className="p-2 text-right font-mono text-purple-400">{s.won}</td>
                      <td className="p-2 text-right font-mono text-cyan-400">{s.avance}</td>
                      <td className="p-2 text-right"><Badge color={getRateColor(s.txClosing, objectifClosing)} size="xs">{formatPercent(s.txClosing)}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {activeTab === 'mensuel' && (
          <Card title="Evolution Mensuelle">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-700 text-slate-400"><th className="p-2 text-left">Mois</th><th className="p-2 text-right">Leads</th><th className="p-2 text-right">Conv</th><th className="p-2 text-right">Won</th><th className="p-2 text-right">Avance</th><th className="p-2 text-right">CA</th><th className="p-2 text-right">Tx Closing</th></tr></thead>
                <tbody>
                  {monthlyEvolution.map((m) => (
                    <tr key={m.date} className="border-b border-slate-800 hover:bg-slate-800/50">
                      <td className="p-2 font-medium">{formatMonthYear(m.date)}</td>
                      <td className="p-2 text-right font-mono">{m.leads}</td>
                      <td className="p-2 text-right font-mono text-emerald-400">{m.converted}</td>
                      <td className="p-2 text-right font-mono text-purple-400">{m.won}</td>
                      <td className="p-2 text-right font-mono text-cyan-400">{m.avance}</td>
                      <td className="p-2 text-right font-mono">{formatCurrency(m.revenue)}</td>
                      <td className="p-2 text-right"><Badge color={getRateColor(m.txClosing, objectifClosing)} size="xs">{formatPercent(m.txClosing)}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Onglet Chauds */}
        {activeTab === 'chauds' && (
          <div className="space-y-4">
            {/* KPIs Deals Chauds */}
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
              <KpiCard icon="📝" label="Devis Signés" value={hotDealsStats.devisSigne.total} subtext={formatCurrency(hotDealsStats.devisSigne.ca)} color="blue" />
              <KpiCard icon="🚨" label="Devis en danger" value={hotDealsStats.devisSigne.enDanger} subtext={`>7j sans contact`} color="red" />
              <KpiCard icon="💰" label="Avances Reçues" value={hotDealsStats.avanceRecu.total} subtext={formatCurrency(hotDealsStats.avanceRecu.ca)} color="green" />
              <KpiCard icon="⏰" label="Avances >30j" value={hotDealsStats.avanceRecu.anciennes} subtext="À suivre" color="orange" />
              <KpiCard icon="✈️" label="Billets Reçus" value={hotDealsStats.billetRecu.total} subtext={formatCurrency(hotDealsStats.billetRecu.ca)} color="purple" />
              <KpiCard icon="💎" label="CA Total Chaud" value={formatCurrency(hotDealsStats.totals.ca)} subtext={`${hotDealsStats.totals.deals} deals`} color="cyan" />
            </div>

            {/* Alerte CA en danger */}
            {hotDealsStats.totals.enDanger > 0 && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">⚠️</span>
                  <div>
                    <p className="text-red-400 font-bold text-lg">CA en danger : {formatCurrency(hotDealsStats.totals.caEnDanger)}</p>
                    <p className="text-slate-400 text-sm">
                      {hotDealsStats.devisSigne.enDanger} devis signés sans contact &gt;7j + {hotDealsStats.avanceRecu.anciennes} avances &gt;30j en étape
                      {hotDealsStats.totals.avecRelance > 0 && <span className="text-emerald-400"> • {hotDealsStats.totals.avecRelance} exclus (relance planifiée)</span>}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Devis Signés en danger */}
            {hotDealsStats.devisSigne.enDanger > 0 && (
              <Card title="🚨 Devis Signés en danger (>7j sans contact)" icon="📝">
                <p className="text-red-400 text-sm mb-3">
                  Ces patients ont signé mais n'ont pas été recontactés depuis plus de 7 jours - risque de perte !
                  {hotDealsStats.devisSigne.avecRelance > 0 && <span className="text-emerald-400 ml-2">({hotDealsStats.devisSigne.avecRelance} exclus car relance planifiée)</span>}
                </p>
                <div className="overflow-x-auto max-h-64">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700 text-slate-400">
                        <th className="p-2 text-left">ID</th>
                        <th className="p-2 text-left">Patient</th>
                        <th className="p-2 text-right">Montant</th>
                        <th className="p-2 text-right">Sans contact</th>
                        <th className="p-2 text-left">Commercial</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hotDealsStats.devisSigne.list.filter(d => d.daysSinceContact > 7 && !d.hasReminder).map(d => (
                        <tr key={d.id} className="border-b border-slate-800 bg-red-500/10">
                          <td className="p-2 font-mono text-xs">{d.id}</td>
                          <td className="p-2 font-medium max-w-[200px] truncate">{d.title}</td>
                          <td className="p-2 text-right font-mono text-cyan-400">{formatCurrency(d.opportunity)}</td>
                          <td className="p-2 text-right"><Badge color={d.daysSinceContact > 14 ? 'red' : 'yellow'} size="xs">{d.daysSinceContact}j</Badge></td>
                          <td className="p-2">{d.commercial}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Tous les Devis Signés */}
            <Card title="📝 Tous les Devis Signés" icon="📋">
              <p className="text-slate-400 text-sm mb-3">{hotDealsStats.devisSigne.total} deals en attente de paiement d'avance</p>
              <div className="overflow-x-auto max-h-64">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-400">
                      <th className="p-2 text-left">ID</th>
                      <th className="p-2 text-left">Patient</th>
                      <th className="p-2 text-right">Montant</th>
                      <th className="p-2 text-right">Sans contact</th>
                      <th className="p-2 text-left">Dernier contact</th>
                      <th className="p-2 text-left">Commercial</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hotDealsStats.devisSigne.list.map(d => (
                      <tr key={d.id} className={`border-b border-slate-800 ${d.daysSinceContact > 7 && !d.hasReminder ? 'bg-red-500/10' : d.hasReminder ? 'bg-emerald-500/5' : d.daysSinceContact > 3 ? 'bg-yellow-500/10' : ''}`}>
                        <td className="p-2 font-mono text-xs">{d.id}</td>
                        <td className="p-2 font-medium max-w-[200px] truncate">{d.title} {d.hasReminder && <span title="Relance planifiée">📅</span>}</td>
                        <td className="p-2 text-right font-mono text-cyan-400">{formatCurrency(d.opportunity)}</td>
                        <td className="p-2 text-right"><Badge color={d.hasReminder ? 'green' : d.daysSinceContact > 7 ? 'red' : d.daysSinceContact > 3 ? 'yellow' : 'green'} size="xs">{d.daysSinceContact}j</Badge></td>
                        <td className="p-2 text-slate-400 text-xs">{formatDate(d.lastContact)}</td>
                        <td className="p-2">{d.commercial}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Avances Reçues */}
            <Card title="💰 Avances Reçues - Suivi" icon="📋">
              <p className="text-slate-400 text-sm mb-3">
                {hotDealsStats.avanceRecu.total} patients ayant versé une avance - triés par ancienneté
                {hotDealsStats.avanceRecu.avecRelance > 0 && <span className="text-emerald-400 ml-2">({hotDealsStats.avanceRecu.avecRelance} avec relance planifiée)</span>}
              </p>
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-400">
                      <th className="p-2 text-left">ID</th>
                      <th className="p-2 text-left">Patient</th>
                      <th className="p-2 text-right">Montant</th>
                      <th className="p-2 text-right">En étape depuis</th>
                      <th className="p-2 text-right">Sans contact</th>
                      <th className="p-2 text-left">Dernier contact</th>
                      <th className="p-2 text-left">Commercial</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hotDealsStats.avanceRecu.list.map(d => (
                      <tr key={d.id} className={`border-b border-slate-800 ${d.daysInStage > 90 && !d.hasReminder ? 'bg-red-500/10' : d.hasReminder ? 'bg-emerald-500/5' : d.daysInStage > 30 ? 'bg-orange-500/10' : ''}`}>
                        <td className="p-2 font-mono text-xs">{d.id}</td>
                        <td className="p-2 font-medium max-w-[200px] truncate">{d.title} {d.hasReminder && <span title="Relance planifiée">📅</span>}</td>
                        <td className="p-2 text-right font-mono text-cyan-400">{formatCurrency(d.opportunity)}</td>
                        <td className="p-2 text-right"><Badge color={d.daysInStage > 90 ? 'red' : d.daysInStage > 30 ? 'orange' : 'green'} size="xs">{d.daysInStage}j</Badge></td>
                        <td className="p-2 text-right"><Badge color={d.daysSinceContact > 14 ? 'red' : d.daysSinceContact > 7 ? 'yellow' : 'green'} size="xs">{d.daysSinceContact}j</Badge></td>
                        <td className="p-2 text-slate-400 text-xs">{formatDate(d.lastContact)}</td>
                        <td className="p-2">{d.commercial}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Billets Avion Reçus */}
            {hotDealsStats.billetRecu.total > 0 && (
              <Card title="✈️ Billets Avion Reçus" icon="🛫">
                <p className="text-slate-400 text-sm mb-3">{hotDealsStats.billetRecu.total} patients avec billet - opération imminente</p>
                <div className="overflow-x-auto max-h-64">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700 text-slate-400">
                        <th className="p-2 text-left">ID</th>
                        <th className="p-2 text-left">Patient</th>
                        <th className="p-2 text-right">Montant</th>
                        <th className="p-2 text-right">Sans contact</th>
                        <th className="p-2 text-left">Commercial</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hotDealsStats.billetRecu.list.map(d => (
                        <tr key={d.id} className="border-b border-slate-800 bg-purple-500/10">
                          <td className="p-2 font-mono text-xs">{d.id}</td>
                          <td className="p-2 font-medium max-w-[200px] truncate">{d.title}</td>
                          <td className="p-2 text-right font-mono text-cyan-400">{formatCurrency(d.opportunity)}</td>
                          <td className="p-2 text-right"><Badge color={d.daysSinceContact > 3 ? 'red' : 'green'} size="xs">{d.daysSinceContact}j</Badge></td>
                          <td className="p-2">{d.commercial}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Récap par commercial */}
            <Card title="👥 Récap par commercial" icon="📊">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-400">
                      <th className="p-2 text-left">Commercial</th>
                      <th className="p-2 text-right">Devis Signés</th>
                      <th className="p-2 text-right">Avances</th>
                      <th className="p-2 text-right">Billets</th>
                      <th className="p-2 text-right">CA Total</th>
                      <th className="p-2 text-right">En danger</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(hotDealsStats.byCommercial)
                      .filter(([_, data]) => data.name && data.name !== 'Inconnu' && !data.name.toLowerCase().includes('test'))
                      .sort((a, b) => b[1].caTotal - a[1].caTotal)
                      .map(([id, data]) => (
                        <tr key={id} className="border-b border-slate-800">
                          <td className="p-2 font-medium">{data.name}</td>
                          <td className="p-2 text-right"><Badge color="blue" size="xs">{data.devisSigne}</Badge></td>
                          <td className="p-2 text-right"><Badge color="green" size="xs">{data.avanceRecu}</Badge></td>
                          <td className="p-2 text-right"><Badge color="purple" size="xs">{data.billetRecu}</Badge></td>
                          <td className="p-2 text-right font-mono text-cyan-400">{formatCurrency(data.caTotal)}</td>
                          <td className="p-2 text-right">{data.enDanger > 0 ? <Badge color="red" size="xs">{data.enDanger}</Badge> : '-'}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {activeTab === 'delais' && (
          <div className="space-y-4">
            <Card title="Délais Leads">
              <div className="grid md:grid-cols-4 gap-4">
                <KpiCard icon="⏱️" label="Lead → Converti" value={formatDelay(delayStats.avgLeadToConverted)} subtext="Delai moyen" color="green" />
                <KpiCard icon="❌" label="Lead → Mauvais" value={formatDelay(delayStats.avgLeadToJunk)} subtext="Delai moyen" color="red" />
                <KpiCard icon="🏆" label="Lead → Won" value={formatDelay(delayStats.avgLeadToWon)} subtext="Via deal lié" color="purple" />
                <KpiCard icon="💳" label="Lead → Avance" value={formatDelay(delayStats.avgLeadToAvance)} subtext="Via deal lié" color="cyan" />
              </div>
            </Card>
            <Card title="Délais Deals">
              <div className="grid md:grid-cols-2 gap-4">
                <KpiCard icon="🏆" label="Deal → Won" value={formatDelay(delayStats.avgDealToWon)} subtext="Delai moyen" color="purple" />
                <KpiCard icon="💳" label="Deal → Avance" value={formatDelay(delayStats.avgDealToAvance)} subtext="Delai moyen" color="cyan" />
              </div>
            </Card>
          </div>
        )}

        {activeTab === 'alerts' && (
          <div className="space-y-4">
            {activitiesLoading && (
              <div className="bg-amber-500/20 border border-amber-500/50 rounded-lg p-3 text-amber-300 text-sm flex items-center gap-2">
                <span className="animate-spin">⏳</span>
                Les activités sont en cours de chargement. Les alertes seront mises à jour dans quelques secondes...
              </div>
            )}
            {/* Paramètres des alertes */}
            <Card title="⚙️ Paramètres des alertes">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-slate-400">Retard après</label>
                  <select 
                    value={delaiRetard} 
                    onChange={(e) => setDelaiRetard(parseInt(e.target.value))}
                    className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm"
                  >
                    {[1, 2, 3, 4, 5, 7, 10, 14].map(j => (
                      <option key={j} value={j}>{j} jour{j > 1 ? 's' : ''}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-slate-400">Critique après</label>
                  <select 
                    value={delaiCritique} 
                    onChange={(e) => setDelaiCritique(parseInt(e.target.value))}
                    className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm"
                  >
                    {[5, 7, 10, 14, 21, 30].map(j => (
                      <option key={j} value={j}>{j} jours</option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={excludeWithReminder} 
                    onChange={(e) => setExcludeWithReminder(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-300">Exclure si relance planifiée</span>
                </label>
                {excludeWithReminder && (
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-slate-400">dans les</label>
                    <select 
                      value={delaiRelanceMax} 
                      onChange={(e) => setDelaiRelanceMax(parseInt(e.target.value))}
                      className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm"
                    >
                      {[3, 5, 7, 10, 14, 21, 30].map(j => (
                        <option key={j} value={j}>{j} jours</option>
                      ))}
                    </select>
                  </div>
                )}
                {rawActivities.length === 0 && (
                  <span className="text-xs text-amber-400">⚠️ Aucune activité synchronisée</span>
                )}
              </div>
            </Card>

            {/* Section LEADS */}
            <Card title="📋 Alertes Leads" icon="🔥">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                <KpiCard icon="🔥" label="Leads en retard" value={alertsLeads.total} subtext={`> ${delaiRetard} jours`} color="red" small />
                <KpiCard icon="⚠️" label="Critiques" value={alertsLeads.critical} subtext={`> ${delaiCritique} jours`} color="red" small />
                <KpiCard icon="👥" label="Personnes" value={Object.keys(alertsLeads.byCommercial).length} color="blue" small />
                {excludeWithReminder && alertsLeads.excludedByReminder > 0 && (
                  <KpiCard icon="✅" label="Exclus (relance)" value={alertsLeads.excludedByReminder} color="green" small />
                )}
              </div>
              
              {Object.keys(alertsLeads.byCommercial).length > 0 ? (
                <div className="space-y-1">
                  {Object.entries(alertsLeads.byCommercial).sort((a, b) => b[1].count - a[1].count).map(([id, data]) => (
                    <AlertItem 
                      key={id} 
                      icon="👤" 
                      title={data.name} 
                      badge={data.count} 
                      badgeColor={data.count > 30 ? 'red' : 'yellow'} 
                      onClick={() => { setSelectedAlertCommercial(id); setAlertModalType('leads'); setShowAlertModal(true); }} 
                    />
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 text-center py-4">🎉 Aucun lead en retard !</p>
              )}
            </Card>

            {/* Section DEALS */}
            <Card title="💼 Alertes Deals" icon="🔥">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                <KpiCard icon="🔥" label="Deals en retard" value={alertsDeals.total} subtext={`> ${delaiRetard} jours`} color="orange" small />
                <KpiCard icon="⚠️" label="Critiques" value={alertsDeals.critical} subtext={`> ${delaiCritique} jours`} color="red" small />
                <KpiCard icon="👥" label="Personnes" value={Object.keys(alertsDeals.byCommercial).length} color="blue" small />
                {excludeWithReminder && alertsDeals.excludedByReminder > 0 && (
                  <KpiCard icon="✅" label="Exclus (relance)" value={alertsDeals.excludedByReminder} color="green" small />
                )}
              </div>
              
              {Object.keys(alertsDeals.byCommercial).length > 0 ? (
                <div className="space-y-1">
                  {Object.entries(alertsDeals.byCommercial).sort((a, b) => b[1].count - a[1].count).map(([id, data]) => (
                    <AlertItem 
                      key={id} 
                      icon="👤" 
                      title={data.name} 
                      badge={data.count} 
                      badgeColor={data.count > 20 ? 'red' : 'orange'} 
                      onClick={() => { setSelectedAlertCommercial(id); setAlertModalType('deals'); setShowAlertModal(true); }} 
                    />
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 text-center py-4">🎉 Aucun deal en retard !</p>
              )}
            </Card>

            {/* Devis expirés */}
            <Card title="📝 Devis expirés" icon="⏰">
              <KpiCard icon="📝" label="Devis expirés" value={expiredQuotes} subtext="> 30 jours" color="yellow" />
            </Card>
          </div>
        )}

        {/* Modal Leads */}
        <Modal isOpen={showAlertModal && alertModalType === 'leads'} onClose={() => setShowAlertModal(false)} title={'Leads en retard - ' + (alertsLeads.byCommercial[selectedAlertCommercial]?.name || '')} size="xl">
          {selectedAlertCommercial && alertsLeads.byCommercial[selectedAlertCommercial] && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <p className="text-slate-400">{alertsLeads.byCommercial[selectedAlertCommercial].count} leads sans contact depuis &gt; {delaiRetard}j</p>
                <Button onClick={() => exportRetards(selectedAlertCommercial, 'leads')} variant="success" size="sm">📥 Exporter</Button>
              </div>
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-700 text-slate-400"><th className="p-2 text-left">Nom</th><th className="p-2 text-left">Etape</th><th className="p-2 text-right">Dernier contact</th></tr></thead>
                  <tbody>
                    {alertsLeads.byCommercial[selectedAlertCommercial].leads.sort((a, b) => b.daysAgo - a.daysAgo).slice(0, 50).map(l => (
                      <tr key={l.id} className={'border-b border-slate-800 ' + (l.daysAgo > delaiCritique ? 'bg-red-500/10' : '')}>
                        <td className="p-2 font-medium max-w-[200px] truncate">{l.title}</td>
                        <td className="p-2"><Badge color="blue" size="xs">{l.status}</Badge></td>
                        <td className="p-2 text-right"><Badge color={l.daysAgo > delaiCritique ? 'red' : 'yellow'} size="xs">{l.daysAgo}j</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Modal>

        {/* Modal Deals */}
        <Modal isOpen={showAlertModal && alertModalType === 'deals'} onClose={() => setShowAlertModal(false)} title={'Deals en retard - ' + (alertsDeals.byCommercial[selectedAlertCommercial]?.name || '')} size="xl">
          {selectedAlertCommercial && alertsDeals.byCommercial[selectedAlertCommercial] && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <p className="text-slate-400">{alertsDeals.byCommercial[selectedAlertCommercial].count} deals sans contact depuis &gt; {delaiRetard}j</p>
                <Button onClick={() => exportRetards(selectedAlertCommercial, 'deals')} variant="success" size="sm">📥 Exporter</Button>
              </div>
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-700 text-slate-400"><th className="p-2 text-left">Nom</th><th className="p-2 text-left">Etape</th><th className="p-2 text-right">Montant</th><th className="p-2 text-right">Dernier contact</th></tr></thead>
                  <tbody>
                    {alertsDeals.byCommercial[selectedAlertCommercial].deals.sort((a, b) => b.daysAgo - a.daysAgo).slice(0, 50).map(d => (
                      <tr key={d.id} className={'border-b border-slate-800 ' + (d.daysAgo > delaiCritique ? 'bg-red-500/10' : '')}>
                        <td className="p-2 font-medium max-w-[200px] truncate">{d.title}</td>
                        <td className="p-2"><Badge color="purple" size="xs">{d.stage}</Badge></td>
                        <td className="p-2 text-right font-mono text-cyan-400">{formatCurrency(d.opportunity)}</td>
                        <td className="p-2 text-right"><Badge color={d.daysAgo > delaiCritique ? 'red' : 'orange'} size="xs">{d.daysAgo}j</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Modal>

        {/* Onglet Aujourd'hui */}
        {activeTab === 'aujourdhui' && (
          <div className="space-y-4">
            {/* Sélecteur de date */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-slate-400">📅 Date :</span>
              <input 
                type="date" 
                value={selectedDayDate} 
                onChange={(e) => setSelectedDayDate(e.target.value)} 
                className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm"
              />
              <Button onClick={() => setSelectedDayDate(new Date().toISOString().slice(0, 10))} variant="secondary" size="sm">Aujourd'hui</Button>
              <Button onClick={() => {
                const d = new Date(selectedDayDate);
                d.setDate(d.getDate() - 1);
                setSelectedDayDate(d.toISOString().slice(0, 10));
              }} variant="ghost" size="sm">← Hier</Button>
              <Button onClick={() => {
                const d = new Date(selectedDayDate);
                d.setDate(d.getDate() + 1);
                setSelectedDayDate(d.toISOString().slice(0, 10));
              }} variant="ghost" size="sm">Demain →</Button>
            </div>

            {/* KPIs du jour */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Card title="✅ Travail réel" className="col-span-2">
                <div className="grid grid-cols-4 gap-2">
                  <KpiCard icon="👥" label="Patients traités" value={dailyStats.realized.patientsTravailles} color="blue" small />
                  <KpiCard icon="➕" label="Nouveaux leads" value={dailyStats.realized.leadsCreated} color="cyan" small />
                  <KpiCard icon="🔄" label="Conversions" value={dailyStats.realized.dealsCreated} color="purple" small />
                  <KpiCard icon="🏆" label="Won" value={dailyStats.realized.won} subtext={formatCurrency(dailyStats.realized.caWon)} color="green" small />
                </div>
              </Card>
              <Card title="📋 Prévu" className="col-span-2">
                <div className="grid grid-cols-3 gap-2">
                  <KpiCard icon="📅" label="Patients à relancer" value={dailyStats.planned.total} color="blue" small />
                  <KpiCard icon="✅" label="Traités" value={dailyStats.planned.done} color="green" small />
                  <KpiCard icon="⚠️" label="En attente" value={dailyStats.planned.pending} color={dailyStats.planned.pending > 0 ? 'red' : 'green'} small />
                </div>
              </Card>
            </div>

            {/* Tableau par commercial */}
            <Card title="👥 Activité par commercial" icon="📊">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-400">
                      <th className="p-2 text-left">Commercial</th>
                      <th className="p-2 text-right" title="Patients travaillés (dédoublonné)">👥 Patients</th>
                      <th className="p-2 text-right" title="Appels sortants">📱↗️ Out</th>
                      <th className="p-2 text-right" title="Appels entrants">📱↙️ In</th>
                      <th className="p-2 text-right" title="Emails envoyés">📧↗️ Out</th>
                      <th className="p-2 text-right" title="Emails reçus">📧↙️ In</th>
                      <th className="p-2 text-right">➕ Leads</th>
                      <th className="p-2 text-right">🔄 Conv.</th>
                      <th className="p-2 text-right">🏆 Won</th>
                      <th className="p-2 text-right">💰 CA</th>
                      <th className="p-2 text-right" title="Patients à relancer (dédoublonné)">📋 Prévus</th>
                      <th className="p-2 text-right" title="Patients en attente (dédoublonné)">⚠️ Attente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyStats.byCommercial.length > 0 ? dailyStats.byCommercial.map(c => (
                      <tr key={c.id} className="border-b border-slate-800 hover:bg-slate-700/30">
                        <td className="p-2 font-medium">{c.name}</td>
                        <td className="p-2 text-right">{c.patientsTravailles > 0 ? <Badge color="blue">{c.patientsTravailles}</Badge> : <span className="text-slate-500">0</span>}</td>
                        <td className="p-2 text-right">{c.appelsOut > 0 ? <Badge color="green">{c.appelsOut}</Badge> : <span className="text-slate-500">0</span>}</td>
                        <td className="p-2 text-right">{c.appelsIn > 0 ? <Badge color="emerald">{c.appelsIn}</Badge> : <span className="text-slate-500">0</span>}</td>
                        <td className="p-2 text-right">{c.emailsOut > 0 ? <Badge color="cyan">{c.emailsOut}</Badge> : <span className="text-slate-500">0</span>}</td>
                        <td className="p-2 text-right">{c.emailsIn > 0 ? <Badge color="blue">{c.emailsIn}</Badge> : <span className="text-slate-500">0</span>}</td>
                        <td className="p-2 text-right">{c.leadsCreated > 0 ? <Badge color="purple">{c.leadsCreated}</Badge> : <span className="text-slate-500">0</span>}</td>
                        <td className="p-2 text-right">{c.dealsCreated > 0 ? <Badge color="orange">{c.dealsCreated}</Badge> : <span className="text-slate-500">0</span>}</td>
                        <td className="p-2 text-right">{c.won > 0 ? <Badge color="green">{c.won}</Badge> : <span className="text-slate-500">0</span>}</td>
                        <td className="p-2 text-right font-mono text-cyan-400">{c.ca > 0 ? formatCurrency(c.ca) : '-'}</td>
                        <td className="p-2 text-right">{c.patientsPlanned > 0 ? c.patientsPlanned : <span className="text-slate-500">0</span>}</td>
                        <td className="p-2 text-right">{c.patientsPending > 0 ? <Badge color="red">{c.patientsPending}</Badge> : <span className="text-emerald-400">✓</span>}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan="12" className="p-4 text-center text-slate-500">Aucune activité pour cette date</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Patients en attente */}
            {dailyStats.planned.pending > 0 && (
              <Card title={`⚠️ Patients en attente (${dailyStats.planned.pending})`} icon="🚨">
                <p className="text-amber-400 text-sm mb-3">Ces patients devaient être relancés le {formatDate(selectedDayDate)} mais n'ont pas encore été traités</p>
                <div className="overflow-x-auto max-h-80">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700 text-slate-400">
                        <th className="p-2 text-left">Commercial</th>
                        <th className="p-2 text-left">Sujet</th>
                        <th className="p-2 text-left">Type</th>
                        <th className="p-2 text-left">Patient/Deal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailyStats.planned.pendingList.map(a => (
                        <tr key={a.id} className="border-b border-slate-800">
                          <td className="p-2 font-medium">{a.commercial}</td>
                          <td className="p-2 max-w-[200px] truncate">{a.subject}</td>
                          <td className="p-2"><Badge color="blue" size="xs">{a.type === '2' ? 'Appel' : a.type === '4' ? 'Email' : a.type === '1' ? 'RDV' : 'Tâche'}</Badge></td>
                          <td className="p-2 text-slate-400">{a.ownerName} <span className="text-xs">({a.ownerType})</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Message si tout est fait */}
            {dailyStats.planned.pending === 0 && dailyStats.planned.total > 0 && (
              <Card className="text-center py-8">
                <p className="text-4xl mb-2">🎉</p>
                <p className="text-emerald-400 text-lg font-medium">Toutes les activités prévues ont été complétées !</p>
                <p className="text-slate-400 text-sm">{dailyStats.planned.done} activités faites sur {dailyStats.planned.total} prévues</p>
              </Card>
            )}
          </div>
        )}

        {/* Onglet Qualité */}
        {activeTab === 'qualite' && (
          <div className="space-y-4">
            {activitiesLoading && (
              <div className="bg-amber-500/20 border border-amber-500/50 rounded-lg p-3 text-amber-300 text-sm flex items-center gap-2">
                <span className="animate-spin">⏳</span>
                Les activités sont en cours de chargement. Les données qualité seront complètes dans quelques secondes...
              </div>
            )}
            {/* KPIs Qualité */}
            <div className="grid grid-cols-2 lg:grid-cols-7 gap-3">
              <KpiCard icon="⚠️" label="Deals sans lead" value={qualityStats.dealsWithoutLead.total} subtext="Total orphelins" color="orange" />
              <KpiCard icon="🚨" label="Won sans lead" value={qualityStats.dealsWithoutLead.won} subtext="Critique - pas de traçabilité" color="red" />
              <KpiCard icon="⏳" label="En cours sans lead" value={qualityStats.dealsWithoutLead.inProgress} subtext="À surveiller" color="yellow" />
              <KpiCard icon="📵" label="Deals jamais contactés" value={qualityStats.dealsWithoutActivity.length} subtext="Aucune activité" color="red" />
              <KpiCard icon="☎️" label="Leads jamais contactés" value={qualityStats.leadsWithoutActivity.length} subtext="Aucune activité" color="pink" />
              <KpiCard icon="👻" label="Fiches orphelines" value={qualityStats.leadsOrphelins.length + qualityStats.dealsOrphelins.length} subtext="Commerciaux inactifs" color="purple" />
              <KpiCard icon="👑" label="Clients fidèles" value={qualityStats.loyalClients.length} subtext="Multi-Won" color="green" />
            </div>

            {/* Boutons d'action */}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => exportQualityCSV()} variant="secondary" size="sm">📥 Exporter CSV</Button>
              <Button onClick={() => sendQualityReportToYosra()} variant="success" size="sm">📧 Envoyer à Yosra</Button>
            </div>

            {/* NOUVEAU: Fiches orphelines (commerciaux inactifs) */}
            {(qualityStats.leadsOrphelins.length > 0 || qualityStats.dealsOrphelins.length > 0) && (
              <Card title="👻 Fiches orphelines (commerciaux inactifs)" icon="⚠️">
                <p className="text-purple-400 text-sm mb-3">
                  Ces fiches sont assignées à des commerciaux qui ne sont plus actifs. 
                  <span className="text-white font-bold ml-2">À réassigner !</span>
                </p>
                
                {qualityStats.leadsOrphelins.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-bold text-slate-300 mb-2">📋 Leads orphelins ({qualityStats.leadsOrphelins.length})</h4>
                    <div className="overflow-x-auto max-h-48">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-700 text-slate-400">
                            <th className="p-2 text-left">ID</th>
                            <th className="p-2 text-left">Nom</th>
                            <th className="p-2 text-left">Status</th>
                            <th className="p-2 text-right">Âge</th>
                            <th className="p-2 text-left">Commercial ID</th>
                          </tr>
                        </thead>
                        <tbody>
                          {qualityStats.leadsOrphelins.slice(0, 20).map(l => (
                            <tr key={l.id} className="border-b border-slate-800 bg-purple-500/10">
                              <td className="p-2 font-mono text-xs">{l.id}</td>
                              <td className="p-2 font-medium max-w-[200px] truncate">{l.title}</td>
                              <td className="p-2"><Badge color="yellow" size="xs">{l.status}</Badge></td>
                              <td className="p-2 text-right"><Badge color={l.daysOld > 30 ? 'red' : 'yellow'} size="xs">{l.daysOld}j</Badge></td>
                              <td className="p-2 text-slate-500">#{l.commercialId} (inactif)</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                
                {qualityStats.dealsOrphelins.length > 0 && (
                  <div>
                    <h4 className="text-sm font-bold text-slate-300 mb-2">💼 Deals orphelins ({qualityStats.dealsOrphelins.length})</h4>
                    <div className="overflow-x-auto max-h-48">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-700 text-slate-400">
                            <th className="p-2 text-left">ID</th>
                            <th className="p-2 text-left">Nom</th>
                            <th className="p-2 text-left">Étape</th>
                            <th className="p-2 text-right">Montant</th>
                            <th className="p-2 text-right">Âge</th>
                            <th className="p-2 text-left">Commercial ID</th>
                          </tr>
                        </thead>
                        <tbody>
                          {qualityStats.dealsOrphelins.slice(0, 20).map(d => (
                            <tr key={d.id} className="border-b border-slate-800 bg-purple-500/10">
                              <td className="p-2 font-mono text-xs">{d.id}</td>
                              <td className="p-2 font-medium max-w-[200px] truncate">{d.title}</td>
                              <td className="p-2"><Badge color="blue" size="xs">{d.stage}</Badge></td>
                              <td className="p-2 text-right font-mono text-cyan-400">{formatCurrency(d.opportunity)}</td>
                              <td className="p-2 text-right"><Badge color={d.daysOld > 30 ? 'red' : 'yellow'} size="xs">{d.daysOld}j</Badge></td>
                              <td className="p-2 text-slate-500">#{d.commercialId} (inactif)</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </Card>
            )}

            {/* Deals Won sans lead - Critique */}
            {qualityStats.dealsWithoutLead.won > 0 && (
              <Card title="🚨 Deals Won sans lead (critique)" icon="⚠️">
                <p className="text-red-400 text-sm mb-3">Ces deals Won n'ont pas de lead source - perte de traçabilité !</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700 text-slate-400">
                        <th className="p-2 text-left">ID</th>
                        <th className="p-2 text-left">Nom</th>
                        <th className="p-2 text-right">Montant</th>
                        <th className="p-2 text-left">Date</th>
                        <th className="p-2 text-left">Commercial</th>
                      </tr>
                    </thead>
                    <tbody>
                      {qualityStats.dealsWithoutLead.list.filter(d => d.stageId && d.stageId.includes('WON')).map(d => (
                        <tr key={d.id} className="border-b border-slate-800 bg-red-500/10">
                          <td className="p-2 font-mono text-xs">{d.id}</td>
                          <td className="p-2 font-medium max-w-[200px] truncate">{d.title}</td>
                          <td className="p-2 text-right font-mono text-cyan-400">{formatCurrency(d.opportunity)}</td>
                          <td className="p-2 text-slate-400">{formatDate(d.dateCreate)}</td>
                          <td className="p-2">{d.commercial}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Deals en cours sans lead */}
            {qualityStats.dealsWithoutLead.inProgress > 0 && (
              <Card title="⏳ Deals en cours sans lead" icon="⚠️">
                <p className="text-amber-400 text-sm mb-3">Ces deals actifs n'ont pas de lead source associé</p>
                <div className="overflow-x-auto max-h-64">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700 text-slate-400">
                        <th className="p-2 text-left">ID</th>
                        <th className="p-2 text-left">Nom</th>
                        <th className="p-2 text-left">Étape</th>
                        <th className="p-2 text-right">Montant</th>
                        <th className="p-2 text-left">Commercial</th>
                        <th className="p-2 text-left">Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {qualityStats.dealsWithoutLead.list.filter(d => d.stageId && !d.stageId.includes('WON') && !d.stageId.includes('LOSE') && !d.stageId.includes('APOLOGY')).slice(0, 20).map(d => (
                        <tr key={d.id} className={`border-b border-slate-800 ${d.hasConflict ? 'bg-orange-500/10' : ''}`}>
                          <td className="p-2 font-mono text-xs">{d.id}</td>
                          <td className="p-2 font-medium max-w-[200px] truncate">{d.title}</td>
                          <td className="p-2"><Badge color="yellow" size="xs">{d.stage}</Badge></td>
                          <td className="p-2 text-right font-mono text-cyan-400">{formatCurrency(d.opportunity)}</td>
                          <td className="p-2">{d.commercial}</td>
                          <td className="p-2 text-xs">
                            {d.hasConflict && d.matchingLead && (
                              <span className="text-orange-400" title={`Lead #${d.matchingLead.id} assigné à ${d.matchingLead.commercial}`}>
                                ⚠️ Lead #{d.matchingLead.id} chez {d.matchingLead.commercial}
                              </span>
                            )}
                            {!d.hasConflict && d.matchingLead && (
                              <span className="text-emerald-400" title={`Lead #${d.matchingLead.id} trouvé chez le même commercial`}>
                                ✓ Lead #{d.matchingLead.id} trouvé
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* NOUVEAU: Deals jamais contactés */}
            {qualityStats.dealsWithoutActivity.length > 0 && (
              <Card title="📵 Deals jamais contactés" icon="🚨">
                <p className="text-red-400 text-sm mb-3">{qualityStats.dealsWithoutActivity.length} deals en cours sans AUCUNE activité (appel, email, etc.) - jamais travaillés !</p>
                <div className="overflow-x-auto max-h-64">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700 text-slate-400">
                        <th className="p-2 text-left">ID</th>
                        <th className="p-2 text-left">Nom</th>
                        <th className="p-2 text-left">Étape</th>
                        <th className="p-2 text-right">Montant</th>
                        <th className="p-2 text-right">Âge</th>
                        <th className="p-2 text-left">Commercial</th>
                      </tr>
                    </thead>
                    <tbody>
                      {qualityStats.dealsWithoutActivity.slice(0, 30).map(d => (
                        <tr key={d.id} className="border-b border-slate-800 bg-red-500/10">
                          <td className="p-2 font-mono text-xs">{d.id}</td>
                          <td className="p-2 font-medium max-w-[200px] truncate">{d.title}</td>
                          <td className="p-2"><Badge color="blue" size="xs">{d.stage}</Badge></td>
                          <td className="p-2 text-right font-mono text-cyan-400">{formatCurrency(d.opportunity)}</td>
                          <td className="p-2 text-right"><Badge color={d.daysOld > 30 ? 'red' : d.daysOld > 7 ? 'yellow' : 'green'} size="xs">{d.daysOld}j</Badge></td>
                          <td className="p-2">{d.commercial}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* NOUVEAU: Leads jamais contactés */}
            {qualityStats.leadsWithoutActivity.length > 0 && (
              <Card title="☎️ Leads jamais contactés" icon="📵">
                <p className="text-pink-400 text-sm mb-3">{qualityStats.leadsWithoutActivity.length} leads actifs sans AUCUNE activité - pas encore travaillés</p>
                <div className="overflow-x-auto max-h-64">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700 text-slate-400">
                        <th className="p-2 text-left">ID</th>
                        <th className="p-2 text-left">Nom</th>
                        <th className="p-2 text-left">Statut</th>
                        <th className="p-2 text-right">Âge</th>
                        <th className="p-2 text-left">Commercial</th>
                      </tr>
                    </thead>
                    <tbody>
                      {qualityStats.leadsWithoutActivity.slice(0, 30).map(l => (
                        <tr key={l.id} className="border-b border-slate-800 bg-pink-500/10">
                          <td className="p-2 font-mono text-xs">{l.id}</td>
                          <td className="p-2 font-medium max-w-[200px] truncate">{l.title}</td>
                          <td className="p-2"><Badge color="pink" size="xs">{l.status}</Badge></td>
                          <td className="p-2 text-right"><Badge color={l.daysOld > 30 ? 'red' : l.daysOld > 7 ? 'yellow' : 'green'} size="xs">{l.daysOld}j</Badge></td>
                          <td className="p-2">{l.commercial}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Tous les deals sans lead */}
            <Card title="📋 Tous les deals sans lead" icon="🔍">
              <p className="text-slate-400 text-sm mb-3">{qualityStats.dealsWithoutLead.total} deals créés sans lead source (dont {qualityStats.dealsWithoutLead.lost} perdus)</p>
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-400">
                      <th className="p-2 text-left">ID</th>
                      <th className="p-2 text-left">Nom</th>
                      <th className="p-2 text-left">Étape</th>
                      <th className="p-2 text-right">Montant</th>
                      <th className="p-2 text-left">Date</th>
                      <th className="p-2 text-left">Commercial</th>
                    </tr>
                  </thead>
                  <tbody>
                    {qualityStats.dealsWithoutLead.list.slice(0, 50).map(d => (
                      <tr key={d.id} className={`border-b border-slate-800 ${d.stageId && d.stageId.includes('WON') ? 'bg-red-500/10' : d.stageId && d.stageId.includes('LOSE') ? 'opacity-50' : ''}`}>
                        <td className="p-2 font-mono text-xs">{d.id}</td>
                        <td className="p-2 font-medium max-w-[200px] truncate">{d.title}</td>
                        <td className="p-2"><Badge color={d.stageId && d.stageId.includes('WON') ? 'green' : d.stageId && d.stageId.includes('LOSE') ? 'red' : 'blue'} size="xs">{d.stage}</Badge></td>
                        <td className="p-2 text-right font-mono text-cyan-400">{formatCurrency(d.opportunity)}</td>
                        <td className="p-2 text-slate-400">{formatDate(d.dateCreate)}</td>
                        <td className="p-2">{d.commercial}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Clients fidèles */}
            <Card title="👑 Clients fidèles (multi-Won)" icon="⭐">
              {qualityStats.loyalClients.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700 text-slate-400">
                        <th className="p-2 text-left">Patient</th>
                        <th className="p-2 text-left">Téléphone</th>
                        <th className="p-2 text-left">Email</th>
                        <th className="p-2 text-right">Nb Won</th>
                        <th className="p-2 text-right">CA Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {qualityStats.loyalClients.map(c => (
                        <tr key={c.leadId} className="border-b border-slate-800">
                          <td className="p-2 font-medium">{c.name}</td>
                          <td className="p-2 text-slate-400">{c.phone}</td>
                          <td className="p-2 text-slate-400 max-w-[200px] truncate">{c.email}</td>
                          <td className="p-2 text-right"><Badge color="purple" size="xs">{c.nbWon}</Badge></td>
                          <td className="p-2 text-right font-mono text-cyan-400">{formatCurrency(c.totalCA)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-slate-500 text-center py-4">Aucun client avec plusieurs interventions Won pour l'instant</p>
              )}
            </Card>
          </div>
        )}

        {/* Onglet Allocation */}
        {activeTab === 'allocation' && (
          <div className="space-y-4">
            {activitiesLoading && (
              <div className="bg-amber-500/20 border border-amber-500/50 rounded-lg p-3 text-amber-300 text-sm flex items-center gap-2">
                <span className="animate-spin">⏳</span>
                Les activités sont en cours de chargement. Les scores d'allocation seront calculés dans quelques secondes...
              </div>
            )}
            {/* KPIs Budget */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard icon="👥" label="Commerciaux actifs" value={allocationStats.commerciaux.length} subtext={`${allocationStats.repartition.prioritaire.length} prioritaires`} color="blue" />
              <KpiCard icon="📩" label="Leads/semaine recommandés" value={allocationStats.totalLeadsParSemaine} subtext={`CPL: ${allocationStats.cpl}€`} color="green" />
              <KpiCard icon="💶" label="Budget hebdo" value={formatCurrency(allocationStats.budgetHebdo)} subtext="Recommandé" color="cyan" />
              <KpiCard icon="📅" label="Budget mensuel" value={formatCurrency(allocationStats.budgetMensuel)} subtext="Projection" color="purple" />
            </div>

            {/* Répartition par statut */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">🟢</span>
                  <span className="font-bold text-emerald-400">Prioritaire</span>
                </div>
                <p className="text-2xl font-bold text-white">{allocationStats.repartition.prioritaire.length}</p>
                <p className="text-sm text-slate-400">15-20 leads/sem chacun</p>
              </div>
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">🔵</span>
                  <span className="font-bold text-blue-400">Normal</span>
                </div>
                <p className="text-2xl font-bold text-white">{allocationStats.repartition.normal.length}</p>
                <p className="text-sm text-slate-400">8-12 leads/sem chacun</p>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">🟡</span>
                  <span className="font-bold text-amber-400">Limité</span>
                </div>
                <p className="text-2xl font-bold text-white">{allocationStats.repartition.limite.length}</p>
                <p className="text-sm text-slate-400">3-5 leads/sem chacun</p>
              </div>
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">🔴</span>
                  <span className="font-bold text-red-400">Stop</span>
                </div>
                <p className="text-2xl font-bold text-white">{allocationStats.repartition.stop.length}</p>
                <p className="text-sm text-slate-400">0 lead jusqu'à amélioration</p>
              </div>
            </div>

            {/* Tableau principal des scores */}
            <Card title="🎯 Score de productivité par commercial" icon="📊">
              <p className="text-slate-400 text-sm mb-4">Analyse sur {allocationStats.periode} • Score max: 100 pts • Objectif closing: 15%</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-400">
                      <th className="p-2 text-left">Commercial</th>
                      <th className="p-2 text-center" title="Score total sur 100">Score</th>
                      <th className="p-2 text-center" title="Closing (35pts) - Objectif 15%">Closing</th>
                      <th className="p-2 text-center" title="Réactivité (25pts) - Délai 1er contact">Réact.</th>
                      <th className="p-2 text-center" title="Saturation (20pts) - % leads en retard">Satur.</th>
                      <th className="p-2 text-center" title="Gaspillage (15pts) - % jamais contactés">Gasp.</th>
                      <th className="p-2 text-center" title="Volume (5pts) - Fiches/jour">Vol.</th>
                      <th className="p-2 text-center">Capacité</th>
                      <th className="p-2 text-center">Recommandation</th>
                      <th className="p-2 text-center">Leads/sem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocationStats.commerciaux.map(c => (
                      <tr key={c.id} className={`border-b border-slate-800 ${c.recommandation === 'stop' ? 'bg-red-500/5' : c.recommandation === 'prioritaire' ? 'bg-emerald-500/5' : ''}`}>
                        <td className="p-2 font-medium">{c.name}</td>
                        <td className="p-2 text-center">
                          <span className={`font-bold text-lg ${c.scoreTotal >= 70 ? 'text-emerald-400' : c.scoreTotal >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                            {c.scoreTotal}
                          </span>
                        </td>
                        <td className="p-2 text-center">
                          <span className="text-xs">{c.scoreClosing}/35</span>
                          <br/><span className="text-slate-500 text-xs">{c.txClosing}%</span>
                        </td>
                        <td className="p-2 text-center">
                          <span className="text-xs">{c.scoreReactivite}/25</span>
                          <br/><span className="text-slate-500 text-xs">{c.avgDelaiContact !== null ? `${c.avgDelaiContact}j` : '-'}</span>
                        </td>
                        <td className="p-2 text-center">
                          <span className="text-xs">{c.scoreSaturation}/20</span>
                          <br/><span className="text-slate-500 text-xs">{c.pctRetard}% retard</span>
                        </td>
                        <td className="p-2 text-center">
                          <span className="text-xs">{c.scoreGaspillage}/15</span>
                          <br/><span className="text-slate-500 text-xs">{c.pctJamaisContactes}% vide</span>
                        </td>
                        <td className="p-2 text-center">
                          <span className="text-xs">{c.scoreVolume}/5</span>
                          <br/><span className="text-slate-500 text-xs">{c.fichesParJour}/j</span>
                        </td>
                        <td className="p-2 text-center">
                          <Badge color={c.capacite >= 5 ? 'green' : c.capacite >= 2 ? 'yellow' : 'red'} size="xs">
                            {c.capacite}
                          </Badge>
                        </td>
                        <td className="p-2 text-center">
                          <Badge color={c.couleur} size="sm">
                            {c.recommandation === 'prioritaire' ? '🟢 Prioritaire' : 
                             c.recommandation === 'normal' ? '🔵 Normal' : 
                             c.recommandation === 'limite' ? '🟡 Limité' : '🔴 Stop'}
                          </Badge>
                        </td>
                        <td className="p-2 text-center font-bold text-lg">
                          {c.leadsParSemaine > 0 ? c.leadsParSemaine : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Détails métriques brutes */}
            <Card title="📈 Métriques détaillées" icon="🔍">
              <p className="text-slate-400 text-sm mb-4">Données brutes des 60 derniers jours</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-400">
                      <th className="p-2 text-left">Commercial</th>
                      <th className="p-2 text-right">Leads reçus</th>
                      <th className="p-2 text-right">Convertis</th>
                      <th className="p-2 text-right">Ventes</th>
                      <th className="p-2 text-right">Tx Closing</th>
                      <th className="p-2 text-right">En cours</th>
                      <th className="p-2 text-right">En retard</th>
                      <th className="p-2 text-right">Jamais contactés</th>
                      <th className="p-2 text-right">Fiches/jour</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocationStats.commerciaux.map(c => (
                      <tr key={c.id} className="border-b border-slate-800">
                        <td className="p-2 font-medium">{c.name}</td>
                        <td className="p-2 text-right">{c.leadsRecus}</td>
                        <td className="p-2 text-right">{c.converted}</td>
                        <td className="p-2 text-right text-emerald-400">{c.ventes}</td>
                        <td className="p-2 text-right">
                          <Badge color={c.txClosing >= 15 ? 'green' : c.txClosing >= 10 ? 'yellow' : 'red'} size="xs">
                            {c.txClosing}%
                          </Badge>
                        </td>
                        <td className="p-2 text-right">{c.leadsEnCours}</td>
                        <td className="p-2 text-right">
                          <span className={c.leadsEnRetard > 5 ? 'text-red-400' : c.leadsEnRetard > 2 ? 'text-amber-400' : 'text-emerald-400'}>
                            {c.leadsEnRetard}
                          </span>
                        </td>
                        <td className="p-2 text-right">
                          <span className={c.leadsJamaisContactes > 3 ? 'text-red-400' : 'text-slate-400'}>
                            {c.leadsJamaisContactes}
                          </span>
                        </td>
                        <td className="p-2 text-right">{c.fichesParJour}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Légende */}
            <Card title="📚 Comment lire ce tableau" icon="ℹ️">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm">
                <div>
                  <h4 className="font-bold text-white mb-2">Composantes du score (100 pts max)</h4>
                  <ul className="space-y-1 text-slate-400">
                    <li><span className="text-cyan-400 font-mono">Closing (35 pts)</span> : Taux de closing vs objectif 15%</li>
                    <li><span className="text-cyan-400 font-mono">Réactivité (25 pts)</span> : Délai moyen avant 1er contact</li>
                    <li><span className="text-cyan-400 font-mono">Saturation (20 pts)</span> : % de leads en retard (&gt;3j)</li>
                    <li><span className="text-cyan-400 font-mono">Gaspillage (15 pts)</span> : % de leads jamais contactés</li>
                    <li><span className="text-cyan-400 font-mono">Volume (5 pts)</span> : Nombre de fiches touchées/jour</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-bold text-white mb-2">Recommandations</h4>
                  <ul className="space-y-1 text-slate-400">
                    <li><span className="text-emerald-400">🟢 Prioritaire</span> : Score ≥70 + Capacité ≥5 → 15-20 leads/sem</li>
                    <li><span className="text-blue-400">🔵 Normal</span> : Score ≥60 + Capacité ≥3 → 8-12 leads/sem</li>
                    <li><span className="text-amber-400">🟡 Limité</span> : Score ≥50 + Capacité ≥2 → 3-5 leads/sem</li>
                    <li><span className="text-red-400">🔴 Stop</span> : Score &lt;50 ou Capacité &lt;2 → 0 lead</li>
                  </ul>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
