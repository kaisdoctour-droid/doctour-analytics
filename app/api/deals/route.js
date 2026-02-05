import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  // Par défaut, on filtre les deals commerciaux uniquement
  const showAll = searchParams.get('all') === 'true';
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
  );

  try {
    const allDeals = [];
    let from = 0;
    const pageSize = 1000;
    
    while (true) {
      let query = supabase
        .from('deals')
        .select('*')
        .order('date_create', { ascending: false });
      
      // Filtrer uniquement les deals commerciaux (sauf si ?all=true)
      if (!showAll) {
        // is_commercial = true (exclut C1:Recrutement et C5:Parrainage)
        query = query.eq('is_commercial', true);
      }
      
      const { data, error } = await query.range(from, from + pageSize - 1);
      
      if (error) throw error;
      if (!data || data.length === 0) break;
      
      allDeals.push(...data);
      from += pageSize;
      
      if (data.length < pageSize) break;
    }

    // Transformer pour compatibilité avec le frontend existant
    const deals = allDeals.map(d => ({
      ID: d.id,
      TITLE: d.title,
      STAGE_ID: d.stage_id,
      ASSIGNED_BY_ID: d.assigned_by_id,
      DATE_CREATE: d.date_create,
      DATE_MODIFY: d.date_modify,
      CLOSEDATE: d.closedate,
      LAST_ACTIVITY_TIME: d.last_activity_time,  // AJOUTÉ - dernier contact réel
      OPPORTUNITY: d.opportunity,
      OPPORTUNITY_EUR: d.opportunity_eur,  // NOUVEAU - Montant en EUR
      CURRENCY_ID: d.currency_id,
      LEAD_ID: d.lead_id,
      PIPELINE: d.pipeline,                // NOUVEAU - DOCTOUR, C1, C3, C5
      IS_COMMERCIAL: d.is_commercial       // NOUVEAU - true/false
    }));

    return Response.json({ 
      success: true, 
      data: deals, 
      total: deals.length,
      filtered: !showAll  // Indique si les données sont filtrées
    });
  } catch (error) {
    console.error('Erreur deals:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
