import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const cleanDate = (d) => (d && d !== '' ? d : null);

// Taux de conversion vers EUR
const CURRENCY_RATES = {
  EUR: 1,
  CAD: 0.704,
  CHF: 1.155,
  USD: 0.92
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const table = searchParams.get('table') || 'leads';
  const startFrom = parseInt(searchParams.get('start') || '0');
  
  const BITRIX_URL = process.env.BITRIX_API_URL;
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const config = {
    leads: {
      endpoint: 'crm.lead.list',
      fields: ['ID', 'TITLE', 'NAME', 'STATUS_ID', 'SOURCE_ID', 'ASSIGNED_BY_ID', 'DATE_CREATE', 'DATE_MODIFY', 'DATE_CLOSED', 'OPPORTUNITY', 'CURRENCY_ID', 'PHONE', 'EMAIL', 'UF_CRM_1742549873'],
      transform: (l) => {
        const opportunity = l.OPPORTUNITY ? parseFloat(l.OPPORTUNITY) : null;
        const currency = l.CURRENCY_ID || 'EUR';
        const rate = CURRENCY_RATES[currency] || 1;
        
        return {
          id: l.ID,
          title: l.TITLE || null,
          name: l.NAME || null,
          status_id: l.STATUS_ID || null,
          source_id: l.SOURCE_ID || null,
          assigned_by_id: l.ASSIGNED_BY_ID || null,
          date_create: cleanDate(l.DATE_CREATE),
          date_modify: cleanDate(l.DATE_MODIFY),
          date_closed: cleanDate(l.DATE_CLOSED),
          opportunity: opportunity,
          opportunity_eur: opportunity ? opportunity * rate : null,
          currency_id: currency,
          phone: l.PHONE?.[0]?.VALUE || null,
          email: l.EMAIL?.[0]?.VALUE || null,
          sales_team: l.UF_CRM_1742549873 || null,
          updated_at: new Date().toISOString()
        };
      }
    },
    deals: {
      endpoint: 'crm.deal.list',
      fields: ['ID', 'TITLE', 'STAGE_ID', 'ASSIGNED_BY_ID', 'DATE_CREATE', 'DATE_MODIFY', 'CLOSEDATE', 'OPPORTUNITY', 'CURRENCY_ID', 'LEAD_ID'],
      transform: (d) => {
        const stage = d.STAGE_ID || '';
        const pipeline = stage.startsWith('C1:') ? 'C1' 
                       : stage.startsWith('C3:') ? 'C3'
                       : stage.startsWith('C5:') ? 'C5' 
                       : 'DOCTOUR';
        const isCommercial = !stage.startsWith('C1:') && !stage.startsWith('C5:');
        
        const opportunity = d.OPPORTUNITY ? parseFloat(d.OPPORTUNITY) : null;
        const currency = d.CURRENCY_ID || 'EUR';
        const rate = CURRENCY_RATES[currency] || 1;
        
        return {
          id: d.ID,
          title: d.TITLE || null,
          stage_id: stage || null,
          assigned_by_id: d.ASSIGNED_BY_ID || null,
          date_create: cleanDate(d.DATE_CREATE),
          date_modify: cleanDate(d.DATE_MODIFY),
          closedate: cleanDate(d.CLOSEDATE),
          opportunity: opportunity,
          opportunity_eur: opportunity ? opportunity * rate : null,
          currency_id: currency,
          lead_id: d.LEAD_ID || null,
          pipeline: pipeline,
          is_commercial: isCommercial,
          updated_at: new Date().toISOString()
        };
      }
    },
    quotes: {
      endpoint: 'crm.quote.list',
      fields: ['ID', 'TITLE', 'STATUS_ID', 'ASSIGNED_BY_ID', 'DATE_CREATE', 'DATE_MODIFY', 'CLOSEDATE', 'OPPORTUNITY', 'CURRENCY_ID', 'DEAL_ID', 'LEAD_ID'],
      transform: (q) => {
        const opportunity = q.OPPORTUNITY ? parseFloat(q.OPPORTUNITY) : null;
        const currency = q.CURRENCY_ID || 'EUR';
        const rate = CURRENCY_RATES[currency] || 1;
        
        return {
          id: q.ID,
          title: q.TITLE || null,
          status_id: q.STATUS_ID || null,
          assigned_by_id: q.ASSIGNED_BY_ID || null,
          date_create: cleanDate(q.DATE_CREATE),
          date_modify: cleanDate(q.DATE_MODIFY),
          closedate: cleanDate(q.CLOSEDATE),
          opportunity: opportunity,
          opportunity_eur: opportunity ? opportunity * rate : null,
          currency_id: currency,
          deal_id: q.DEAL_ID || null,
          lead_id: q.LEAD_ID || null,
          updated_at: new Date().toISOString()
        };
      }
    }
  };

  const cfg = config[table];
  if (!cfg) return Response.json({ error: 'Table invalide. Tables supportées: leads, deals, quotes' }, { status: 400 });

  try {
    const allData = [];
    let start = startFrom;
    let iterations = 0;
    const maxIterations = 35;

    while (iterations < maxIterations) {
      const selectParams = cfg.fields.map((f, i) => `select[${i}]=${f}`).join('&');
      const url = `${BITRIX_URL}${cfg.endpoint}?start=${start}&${selectParams}`;
      
      const response = await fetch(url);
      if (response.status === 429) { await delay(2000); continue; }
      
      const data = await response.json();
      if (data.error === 'QUERY_LIMIT_EXCEEDED') { await delay(1500); continue; }
      
      if (data.result?.length > 0) {
        allData.push(...data.result);
        start += 50;
        iterations++;
        if (data.result.length < 50 || !data.next) break;
        await delay(400);
      } else break;
    }

    if (allData.length > 0) {
      const transformed = allData.map(cfg.transform);
      for (let i = 0; i < transformed.length; i += 500) {
        const batch = transformed.slice(i, i + 500);
        await supabase.from(table).upsert(batch, { onConflict: 'id' });
      }
    }

    const hasMore = iterations >= maxIterations;

    return Response.json({
      success: true,
      table,
      count: allData.length,
      totalSynced: startFrom + allData.length,
      hasMore,
      nextStart: hasMore ? start : null
    });

  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
