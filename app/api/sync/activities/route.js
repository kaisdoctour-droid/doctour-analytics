import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const cleanDate = (d) => (d && d !== '' ? d : null);

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const startFrom = parseInt(searchParams.get('start') || '0');
  // Par défaut: récupère TOUTES les activités (complétées et non complétées)
  // Utiliser ?pending=true pour ne récupérer que les non complétées
  const onlyPending = searchParams.get('pending') === 'true';
  
  const BITRIX_URL = process.env.BITRIX_API_URL;
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  try {
    const allActivities = [];
    let start = startFrom;
    let iterations = 0;
    const maxIterations = 40;

    while (iterations < maxIterations) {
      let url = `${BITRIX_URL}crm.activity.list?start=${start}`;
      url += `&select[]=ID&select[]=OWNER_TYPE_ID&select[]=OWNER_ID&select[]=TYPE_ID`;
      url += `&select[]=SUBJECT&select[]=COMPLETED&select[]=RESPONSIBLE_ID`;
      url += `&select[]=CREATED&select[]=LAST_UPDATED&select[]=DEADLINE`;
      url += `&select[]=START_TIME&select[]=END_TIME&select[]=DIRECTION`;
      
      // Filtre optionnel sur les activités non complétées
      if (onlyPending) url += `&filter[COMPLETED]=N`;
      
      // Filtre sur les types d'entités (leads et deals uniquement)
      url += `&filter[OWNER_TYPE_ID][0]=1&filter[OWNER_TYPE_ID][1]=2`;
      
      const response = await fetch(url);
      
      if (response.status === 429) {
        await delay(2000);
        continue;
      }
      
      const data = await response.json();
      
      if (data.error === 'QUERY_LIMIT_EXCEEDED') {
        await delay(1500);
        continue;
      }
      
      if (data.result?.length > 0) {
        allActivities.push(...data.result);
        start += 50;
        iterations++;
        if (data.result.length < 50 || !data.next) break;
        await delay(400);
      } else break;
    }

    if (allActivities.length > 0) {
      const activities = allActivities.map(a => ({
        id: a.ID,
        owner_type_id: a.OWNER_TYPE_ID || null,
        owner_id: a.OWNER_ID || null,
        type_id: a.TYPE_ID || null,
        subject: a.SUBJECT || null,
        completed: a.COMPLETED === 'Y' ? 'true' : 'false',
        responsible_id: a.RESPONSIBLE_ID || null,
        created: cleanDate(a.CREATED),
        last_updated: cleanDate(a.LAST_UPDATED),
        deadline: cleanDate(a.DEADLINE),
        start_time: cleanDate(a.START_TIME),
        end_time: cleanDate(a.END_TIME),
        direction: a.DIRECTION || null,
        updated_at: new Date().toISOString()
      }));
      
      for (let i = 0; i < activities.length; i += 500) {
        const batch = activities.slice(i, i + 500);
        await supabase.from('activities').upsert(batch, { onConflict: 'id' });
      }
    }

    const hasMore = iterations >= maxIterations;

    return Response.json({
      success: true,
      message: onlyPending ? 'Sync activités non complétées uniquement' : 'Sync TOUTES les activités',
      count: allActivities.length,
      totalSynced: startFrom + allActivities.length,
      hasMore,
      nextStart: hasMore ? start : null
    });

  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
