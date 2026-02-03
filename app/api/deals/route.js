import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
  );

  try {
    const allDeals = [];
    let from = 0;
    const pageSize = 1000;
    
    while (true) {
      const { data, error } = await supabase
        .from('deals')
        .select('*')
        .order('date_create', { ascending: false })
        .range(from, from + pageSize - 1);
      
      if (error) throw error;
      if (!data || data.length === 0) break;
      
      allDeals.push(...data);
      from += pageSize;
      
      if (data.length < pageSize) break;
    }

    const deals = allDeals.map(d => ({
      ID: d.id,
      TITLE: d.title,
      STAGE_ID: d.stage_id,
      ASSIGNED_BY_ID: d.assigned_by_id,
      DATE_CREATE: d.date_create,
      DATE_MODIFY: d.date_modify,
      CLOSEDATE: d.closedate,
      OPPORTUNITY: d.opportunity,
      CURRENCY_ID: d.currency_id,
      LEAD_ID: d.lead_id,
      LAST_ACTIVITY_TIME: d.last_activity_time,
      LAST_ACTIVITY_BY: d.last_activity_by,
      MOVED_TIME: d.moved_time
    }));

    return Response.json({ success: true, data: deals, total: deals.length });
  } catch (error) {
    console.error('Erreur deals:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
