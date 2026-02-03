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
  
  // Options pour les alertes
  const [excludeWithReminder, setExcludeWithReminder] = useState(true);
  const [delaiRetard, setDelaiRetard] = useState(3); // Jours avant retard
  const [delaiCritique, setDelaiCritique] = useState(7); // Jours avant critique

  // Onglet Aujourd'hui
  const [selectedDayDate, setSelectedDayDate] = useState(new Date().toISOString().slice(0, 10));

  const [rawLeads, setRawLeads] = useState([]);
  const [rawDeals, setRawDeals] = useState([]);
  const [rawUsers, setRawUsers] = useState([]);
  const [rawQuotes, setRawQuotes] = useState([]);
  const [rawSources, setRawSources] = useState({});
  const [rawActivities, setRawActivities] = useState([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setApiStatus('connecting');
    try {
      const usersRes = await fetch('/api/users');
      const usersData = await usersRes.json();
      if (!usersData.success) throw new Error('Erreur utilisateurs');
      setRawUsers(usersData.data || []);
      
      const sourcesRes = await fetch('/api/sources');
      const sourcesData = await sourcesRes.json();
      setRawSources(sourcesData.data || {});
      
      const leadsRes = await fetch('/api/leads');
      const leadsData = await leadsRes.json();
      if (!leadsData.success) throw new Error('Erreur leads: ' + (leadsData.error || 'inconnu'));
      setRawLeads(leadsData.data || []);
      
      const dealsRes = await fetch('/api/deals');
      const dealsData = await dealsRes.json();
      if (!dealsData.success) throw new Error('Erreur deals');
      setRawDeals(dealsData.data || []);
      
      const quotesRes = await fetch('/api/quotes');
      const quotesData = await quotesRes.json();
      setRawQuotes(quotesData.data || []);
      
      const activitiesRes = await fetch('/api/activities');
      const activitiesData = await activitiesRes.json();
      setRawActivities(activitiesData.data || []);
      
      setApiStatus('live');
      setLastUpdate(new Date());
    } catch (err) {
      setError(err.message);
      setApiStatus('error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Fonction de sync automatique complète
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

  // ====== Identifier les leads avec relance planifiée ======
  const leadsWithPendingReminder = useMemo(() => {
    const leadIds = new Set();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    rawActivities.forEach(a => {
      const isCompleted = a.COMPLETED === true || a.COMPLETED === 'true' || a.COMPLETED === 'Y';
      
      if (a.OWNER_TYPE_ID === '1' && !isCompleted) {
        const deadline = a.DEADLINE ? new Date(a.DEADLINE) : null;
        const startTime = a.START_TIME ? new Date(a.START_TIME) : null;
        const activityDate = deadline || startTime;
        
        if (!activityDate || activityDate >= today) {
          leadIds.add(a.OWNER_ID);
        }
      }
    });
    
    return leadIds;
  }, [rawActivities]);

  // ====== Identifier les deals avec relance planifiée ======
  const dealsWithPendingReminder = useMemo(() => {
    const dealIds = new Set();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    rawActivities.forEach(a => {
      const isCompleted = a.COMPLETED === true || a.COMPLETED === 'true' || a.COMPLETED === 'Y';
      
      // OWNER_TYPE_ID = '2' signifie Deal
      if (a.OWNER_TYPE_ID === '2' && !isCompleted) {
        const deadline = a.DEADLINE ? new Date(a.DEADLINE) : null;
        const startTime = a.START_TIME ? new Date(a.START_TIME) : null;
        const activityDate = deadline || startTime;
        
        if (!activityDate || activityDate >= today) {
          dealIds.add(a.OWNER_ID);
        }
      }
    });
    
    return dealIds;
  }, [rawActivities]);

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
      
      // Vérifier si le lead est en retard
      const isStale = daysAgo(l.DATE_MODIFY) > delaiRetard;
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
      
      byCommercial[id].leads.push({
        id: l.ID, title: l.TITLE || l.NAME || 'Sans nom', status: LEAD_STATUS_MAP[l.STATUS_ID] || l.STATUS_ID,
        dateCreate: l.DATE_CREATE, dateModify: l.DATE_MODIFY, daysAgo: daysAgo(l.DATE_MODIFY),
        phone: l.PHONE && l.PHONE[0] ? l.PHONE[0].VALUE : '', source: getSourceName(l.SOURCE_ID),
        hasReminder
      });
    });
    
    const byEtape = {};
    staleLeads.forEach(l => {
      const s = LEAD_STATUS_MAP[l.STATUS_ID] || l.STATUS_ID || 'Autre';
      byEtape[s] = (byEtape[s] || 0) + 1;
    });
    
    const critical = staleLeads.filter(l => daysAgo(l.DATE_MODIFY) > delaiCritique).length;
    
    // Compter les leads exclus car ils ont une relance
    const excludedByReminder = rawLeads.filter(l => {
      if (['CONVERTED', 'JUNK'].includes(l.STATUS_ID)) return false;
      if (daysAgo(l.DATE_MODIFY) <= delaiRetard) return false;
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
      
      // Vérifier si le deal est en retard
      const isStale = daysAgo(d.DATE_MODIFY) > delaiRetard;
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
      
      byCommercial[id].deals.push({
        id: d.ID, title: d.TITLE || 'Sans nom', stage: DEAL_STAGE_MAP[d.STAGE_ID] || d.STAGE_ID,
        dateCreate: d.DATE_CREATE, dateModify: d.DATE_MODIFY, daysAgo: daysAgo(d.DATE_MODIFY),
        opportunity: d.OPPORTUNITY, hasReminder
      });
    });
    
    const byEtape = {};
    staleDeals.forEach(d => {
      const s = DEAL_STAGE_MAP[d.STAGE_ID] || d.STAGE_ID || 'Autre';
      byEtape[s] = (byEtape[s] || 0) + 1;
    });
    
    const critical = staleDeals.filter(d => daysAgo(d.DATE_MODIFY) > delaiCritique).length;
    
    // Compter les deals exclus car ils ont une relance
    const excludedByReminder = rawDeals.filter(d => {
      if (d.STAGE_ID && (d.STAGE_ID.startsWith('C1:') || d.STAGE_ID.startsWith('C5:'))) return false;
      if (d.STAGE_ID && (d.STAGE_ID.includes('WON') || d.STAGE_ID.includes('LOSE') || d.STAGE_ID.includes('APOLOGY'))) return false;
      if (daysAgo(d.DATE_MODIFY) <= delaiRetard) return false;
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
    // Deals sans lead (orphelins)
    const dealsWithoutLead = filteredDeals.filter(d => 
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
    
    // Clients fidèles (leads avec plusieurs deals Won)
    const leadDealsCount = {};
    filteredDeals.forEach(d => {
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
        list: dealsWithoutLead.map(d => ({
          id: d.ID,
          title: d.TITLE || 'Sans nom',
          stage: DEAL_STAGE_MAP[d.STAGE_ID] || d.STAGE_ID,
          stageId: d.STAGE_ID,
          opportunity: d.OPPORTUNITY,
          dateCreate: d.DATE_CREATE,
          commercial: getUserName(d.ASSIGNED_BY_ID)
        })).sort((a, b) => new Date(b.dateCreate) - new Date(a.dateCreate))
      },
      loyalClients
    };
  }, [filteredDeals, rawLeads, getUserName]);

  // ====== STATS DU JOUR (AUJOURD'HUI) ======
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
    const activitiesCreatedToday = rawActivities.filter(a => isSameDay(a.CREATED, dateStr));
    
    // Nouveaux leads créés aujourd'hui (vrais nouveaux leads, pas modifiés)
    const leadsCreated = rawLeads.filter(l => isSameDay(l.DATE_CREATE, dateStr));
    
    // Deals créés aujourd'hui (conversions)
    const dealsCreated = commercialDeals.filter(d => isSameDay(d.DATE_CREATE, dateStr));
    
    // Won et Avance basés sur DATE_MODIFY (changement d'étape)
    const wonToday = commercialDeals.filter(d => d.STAGE_ID && d.STAGE_ID.includes('WON') && isSameDay(d.DATE_MODIFY, dateStr));
    const avanceToday = commercialDeals.filter(d => d.STAGE_ID && d.STAGE_ID.includes('FINAL_INVOICE') && !d.STAGE_ID.includes('APOLOGY') && isSameDay(d.DATE_MODIFY, dateStr));
    const caWonToday = wonToday.reduce((sum, d) => sum + parseFloat(d.OPPORTUNITY || 0), 0);
    
    // PRÉVU - Activités planifiées pour ce jour
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
      
      // Détail par type d'activité
      const userAppels = userActivitiesCreated.filter(a => a.TYPE_ID === '2').length;
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
      
      // Activités prévues
      const userActivitiesPlanned = activitiesPlanned.filter(a => a.RESPONSIBLE_ID === userId);
      const userActivitiesDone = userActivitiesPlanned.filter(a => isActivityEffectivelyDone(a));
      const userActivitiesPending = userActivitiesPlanned.filter(a => !isActivityEffectivelyDone(a));
      
      byCommercial[userId] = {
        id: userId,
        name,
        // TRAVAIL RÉEL = activités créées
        activitiesCreated: userActivitiesCreated.length,
        appels: userAppels,
        emails: userEmails,
        taches: userTaches,
        rdv: userRdv,
        // Autres métriques
        leadsCreated: userLeadsCreated.length,
        dealsCreated: userDealsCreated.length,
        won: userWon.length,
        ca: userCA,
        // Prévisions
        activitiesPlanned: userActivitiesPlanned.length,
        activitiesDone: userActivitiesDone.length,
        activitiesPending: userActivitiesPending.length,
        pendingList: userActivitiesPending.map(a => {
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
        })
      };
    });
    
    // Liste des activités en retard (prévues mais non faites)
    const pendingActivitiesList = activitiesPlannedPending.map(a => {
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
    
    return {
      date: dateStr,
      realized: {
        activitiesCreated: activitiesCreatedToday.length,
        leadsCreated: leadsCreated.length,
        dealsCreated: dealsCreated.length,
        won: wonToday.length,
        avance: avanceToday.length,
        caWon: caWonToday
      },
      planned: {
        total: activitiesPlanned.length,
        done: activitiesPlannedDone.length,
        pending: activitiesPlannedPending.length,
        pendingList: pendingActivitiesList
      },
      byCommercial: Object.values(byCommercial).sort((a, b) => 
        b.activitiesCreated - a.activitiesCreated
      )
    };
  }, [selectedDayDate, rawLeads, rawDeals, rawActivities, getUserName]);

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
    { id: 'delais', label: 'Delais', icon: '⏱️' },
    { id: 'alerts', label: 'Alertes', icon: '🚨', badge: alertsLeads.total + alertsDeals.total },
    { id: 'qualite', label: 'Qualité', icon: '🔍', badge: qualityStats.dealsWithoutLead.won + qualityStats.dealsWithoutLead.inProgress }
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
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DateRangePicker presets={PERIOD_PRESETS} selectedPreset={selectedPeriod} onPresetChange={setSelectedPeriod} startDate={customStartDate} endDate={customEndDate} onStartChange={setCustomStartDate} onEndChange={setCustomEndDate} />
            <CommercialSelect commercials={commercialsList} selected={selectedCommercials} onChange={setSelectedCommercials} />
            <Button onClick={exportCSV} variant="secondary" size="sm">📥 CSV</Button>
            <Button onClick={syncAllData} disabled={syncing} variant="success" size="sm">
              {syncing ? '⏳' : '🔄'} Sync
            </Button>
          </div>
        </div>

        {syncing && (
          <div className="bg-blue-500/20 border border-blue-500/50 rounded-lg p-3 text-blue-300 text-sm">
            ⏳ {syncProgress}
          </div>
        )}

        {rawLeads.length === 0 && !syncing && (
          <div className="bg-amber-500/20 border border-amber-500/50 rounded-lg p-4 text-center">
            <p className="text-amber-300 mb-2">Base de données vide</p>
            <Button onClick={syncAllData} variant="success">🔄 Synchroniser TOUT depuis Bitrix24</Button>
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
                <p className="text-slate-400">{alertsLeads.byCommercial[selectedAlertCommercial].count} leads en retard (&gt; {delaiRetard}j)</p>
                <Button onClick={() => exportRetards(selectedAlertCommercial, 'leads')} variant="success" size="sm">📥 Exporter</Button>
              </div>
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-700 text-slate-400"><th className="p-2 text-left">Nom</th><th className="p-2 text-left">Etape</th><th className="p-2 text-right">Jours</th></tr></thead>
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
                <p className="text-slate-400">{alertsDeals.byCommercial[selectedAlertCommercial].count} deals en retard (&gt; {delaiRetard}j)</p>
                <Button onClick={() => exportRetards(selectedAlertCommercial, 'deals')} variant="success" size="sm">📥 Exporter</Button>
              </div>
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-700 text-slate-400"><th className="p-2 text-left">Nom</th><th className="p-2 text-left">Etape</th><th className="p-2 text-right">Montant</th><th className="p-2 text-right">Jours</th></tr></thead>
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
                  <KpiCard icon="📞" label="Activités créées" value={dailyStats.realized.activitiesCreated} color="blue" small />
                  <KpiCard icon="➕" label="Nouveaux leads" value={dailyStats.realized.leadsCreated} color="cyan" small />
                  <KpiCard icon="🔄" label="Conversions" value={dailyStats.realized.dealsCreated} color="purple" small />
                  <KpiCard icon="🏆" label="Won" value={dailyStats.realized.won} subtext={formatCurrency(dailyStats.realized.caWon)} color="green" small />
                </div>
              </Card>
              <Card title="📋 Prévu" className="col-span-2">
                <div className="grid grid-cols-3 gap-2">
                  <KpiCard icon="📅" label="Relances prévues" value={dailyStats.planned.total} color="blue" small />
                  <KpiCard icon="✅" label="Traitées" value={dailyStats.planned.done} color="green" small />
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
                      <th className="p-2 text-right">📞 Activités</th>
                      <th className="p-2 text-right">📱 Appels</th>
                      <th className="p-2 text-right">📧 Emails</th>
                      <th className="p-2 text-right">➕ Leads</th>
                      <th className="p-2 text-right">🔄 Conv.</th>
                      <th className="p-2 text-right">🏆 Won</th>
                      <th className="p-2 text-right">💰 CA</th>
                      <th className="p-2 text-right">📋 Prévues</th>
                      <th className="p-2 text-right">⚠️ Attente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyStats.byCommercial.length > 0 ? dailyStats.byCommercial.map(c => (
                      <tr key={c.id} className="border-b border-slate-800 hover:bg-slate-700/30">
                        <td className="p-2 font-medium">{c.name}</td>
                        <td className="p-2 text-right">{c.activitiesCreated > 0 ? <Badge color="blue">{c.activitiesCreated}</Badge> : <span className="text-slate-500">0</span>}</td>
                        <td className="p-2 text-right">{c.appels > 0 ? <Badge color="green">{c.appels}</Badge> : <span className="text-slate-500">0</span>}</td>
                        <td className="p-2 text-right">{c.emails > 0 ? <Badge color="cyan">{c.emails}</Badge> : <span className="text-slate-500">0</span>}</td>
                        <td className="p-2 text-right">{c.leadsCreated > 0 ? <Badge color="purple">{c.leadsCreated}</Badge> : <span className="text-slate-500">0</span>}</td>
                        <td className="p-2 text-right">{c.dealsCreated > 0 ? <Badge color="orange">{c.dealsCreated}</Badge> : <span className="text-slate-500">0</span>}</td>
                        <td className="p-2 text-right">{c.won > 0 ? <Badge color="green">{c.won}</Badge> : <span className="text-slate-500">0</span>}</td>
                        <td className="p-2 text-right font-mono text-cyan-400">{c.ca > 0 ? formatCurrency(c.ca) : '-'}</td>
                        <td className="p-2 text-right">{c.activitiesPlanned > 0 ? c.activitiesPlanned : <span className="text-slate-500">0</span>}</td>
                        <td className="p-2 text-right">{c.activitiesPending > 0 ? <Badge color="red">{c.activitiesPending}</Badge> : <span className="text-emerald-400">✓</span>}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan="10" className="p-4 text-center text-slate-500">Aucune activité pour cette date</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Activités en retard */}
            {dailyStats.planned.pending > 0 && (
              <Card title={`⚠️ Relances en attente (${dailyStats.planned.pending})`} icon="🚨">
                <p className="text-amber-400 text-sm mb-3">Ces relances étaient planifiées pour le {formatDate(selectedDayDate)} mais n'ont pas encore été traitées</p>
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
            {/* KPIs Qualité */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard icon="⚠️" label="Deals sans lead" value={qualityStats.dealsWithoutLead.total} subtext="Total orphelins" color="orange" />
              <KpiCard icon="🚨" label="Won sans lead" value={qualityStats.dealsWithoutLead.won} subtext="Critique - pas de traçabilité" color="red" />
              <KpiCard icon="⏳" label="En cours sans lead" value={qualityStats.dealsWithoutLead.inProgress} subtext="À surveiller" color="yellow" />
              <KpiCard icon="👑" label="Clients fidèles" value={qualityStats.loyalClients.length} subtext="Multi-Won" color="purple" />
            </div>

            {/* Boutons d'action */}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => exportQualityCSV()} variant="secondary" size="sm">📥 Exporter CSV</Button>
              <Button onClick={() => sendQualityReportToYosra()} variant="success" size="sm">📧 Envoyer à Yosra</Button>
            </div>

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
                      </tr>
                    </thead>
                    <tbody>
                      {qualityStats.dealsWithoutLead.list.filter(d => d.stageId && !d.stageId.includes('WON') && !d.stageId.includes('LOSE') && !d.stageId.includes('APOLOGY')).slice(0, 20).map(d => (
                        <tr key={d.id} className="border-b border-slate-800">
                          <td className="p-2 font-mono text-xs">{d.id}</td>
                          <td className="p-2 font-medium max-w-[200px] truncate">{d.title}</td>
                          <td className="p-2"><Badge color="yellow" size="xs">{d.stage}</Badge></td>
                          <td className="p-2 text-right font-mono text-cyan-400">{formatCurrency(d.opportunity)}</td>
                          <td className="p-2">{d.commercial}</td>
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
      </div>
    </div>
  );
}
