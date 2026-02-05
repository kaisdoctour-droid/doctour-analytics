import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  // Par défaut : 90 derniers jours (suffisant pour alertes, qualité, allocation, aujourd'hui)
  // Passer ?all=true pour tout charger
  const loadAll = searchParams.get('all') === 'true';
  const days = parseInt(searchParams.get('days') || '90');
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
  );

  try {
    const allActivities = [];
    let from = 0;
    const pageSize = 1000;
    
    // Date limite
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() - days);
    const limitDateStr = limitDate.toISOString();
    
    while (true) {
      let query = supabase
        .from('activities')
        .select('*')
        .order('created', { ascending: false });
      
      if (!loadAll) {
        query = query.gte('created', limitDateStr);
      }
      
      const { data, error } = await query.range(from, from + pageSize - 1);
      
      if (error) throw error;
      if (!data || data.length === 0) break;
      
      allActivities.push(...data);
      from += pageSize;
      
      if (data.length < pageSize) break;
      
      // Sécurité en mode all
      if (loadAll && allActivities.length >= 100000) {
        console.warn('Activities: limite sécurité 100k atteinte');
        break;
      }
    }

    const activities = allActivities.map(a => ({
      ID: a.id,
      TYPE_ID: a.type_id,
      SUBJECT: a.subject,
      OWNER_ID: a.owner_id,
      OWNER_TYPE_ID: a.owner_type_id,
      RESPONSIBLE_ID: a.responsible_id,
      CREATED: a.created,
      LAST_UPDATED: a.last_updated,
      DEADLINE: a.deadline,
      START_TIME: a.start_time,
      END_TIME: a.end_time,
      COMPLETED: a.completed,
      DIRECTION: a.direction
    }));

    return Response.json({ 
      success: true, 
      data: activities, 
      total: activities.length,
      filtered: !loadAll,
      days: loadAll ? 'all' : days
    });
  } catch (error) {
    console.error('Erreur activities:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
