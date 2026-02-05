import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  // Par défaut, on filtre les leads commerciaux uniquement
  const showAll = searchParams.get('all') === 'true';
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
  );

  try {
    const allLeads = [];
    let from = 0;
    const pageSize = 1000;
    
    while (true) {
      let query = supabase
        .from('leads')
        .select('*')
        .order('date_create', { ascending: false });
      
      // Filtrer uniquement les leads commerciaux (sauf si ?all=true)
      if (!showAll) {
        // 257 = DOCTOUR, 259 = DOCTOUR-IT (commerciaux)
        // On inclut aussi les leads sans équipe assignée (historique)
        query = query.or('sales_team.in.(257,259),sales_team.is.null');
      }
      
      const { data, error } = await query.range(from, from + pageSize - 1);
      
      if (error) throw error;
      if (!data || data.length === 0) break;
      
      allLeads.push(...data);
      from += pageSize;
      
      if (data.length < pageSize) break;
    }

    // Transformer pour compatibilité avec le frontend existant
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
      LAST_ACTIVITY_TIME: l.last_activity_time,  // AJOUTÉ - dernier contact réel
      OPPORTUNITY: l.opportunity,
      OPPORTUNITY_EUR: l.opportunity_eur,  // NOUVEAU
      CURRENCY_ID: l.currency_id,
      SALES_TEAM: l.sales_team,            // NOUVEAU
      PHONE: l.phone ? [{ VALUE: l.phone }] : [],
      EMAIL: l.email ? [{ VALUE: l.email }] : []
    }));

    return Response.json({ 
      success: true, 
      data: leads, 
      total: leads.length,
      filtered: !showAll  // Indique si les données sont filtrées
    });
  } catch (error) {
    console.error('Erreur leads:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
