import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
  );

  try {
    const allQuotes = [];
    let from = 0;
    const pageSize = 1000;
    
    while (true) {
      const { data, error } = await supabase
        .from('quotes')
        .select('*')
        .order('date_create', { ascending: false })
        .range(from, from + pageSize - 1);
      
      if (error) throw error;
      if (!data || data.length === 0) break;
      
      allQuotes.push(...data);
      from += pageSize;
      
      if (data.length < pageSize) break;
    }

    const quotes = allQuotes.map(q => ({
      ID: q.id,
      TITLE: q.title,
      STATUS_ID: q.status_id,
      ASSIGNED_BY_ID: q.assigned_by_id,
      DATE_CREATE: q.date_create,
      DATE_MODIFY: q.date_modify,
      CLOSEDATE: q.closedate,
      OPPORTUNITY: q.opportunity,
      DEAL_ID: q.deal_id
    }));

    return Response.json({ success: true, data: quotes, total: quotes.length });
  } catch (error) {
    console.error('Erreur quotes:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
