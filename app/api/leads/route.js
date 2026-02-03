import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
  );

  try {
    const allLeads = [];
    let from = 0;
    const pageSize = 1000;
    
    while (true) {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .order('date_create', { ascending: false })
        .range(from, from + pageSize - 1);
      
      if (error) throw error;
      if (!data || data.length === 0) break;
      
      allLeads.push(...data);
      from += pageSize;
      
      if (data.length < pageSize) break;
    }

    const leads = allLeads.map(l => ({
      ID: l.id,
      TITLE: l.title,
      NAME: l.name,
      STATUS_ID: l.status_id,
      SOURCE_ID: l.source_id,
      ASSIGNED_BY_ID: l.assigned_by_id,
      DATE_CREATE: l.date_create,
      DATE_MODIFY: l.date_modify,
      DATE_CLOSED: l.date_closed,
      OPPORTUNITY: l.opportunity,
      CURRENCY_ID: l.currency_id,
      PHONE: l.phone ? [{ VALUE: l.phone }] : [],
      EMAIL: l.email ? [{ VALUE: l.email }] : [],
      LAST_ACTIVITY_TIME: l.last_activity_time,
      LAST_ACTIVITY_BY: l.last_activity_by
    }));

    return Response.json({ success: true, data: leads, total: leads.length });
  } catch (error) {
    console.error('Erreur leads:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
