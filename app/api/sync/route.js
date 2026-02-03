import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
  const BITRIX_URL = process.env.BITRIX_API_URL;
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const results = { users: 0, sources: 0 };

  try {
    // Sync Users
    const usersRes = await fetch(`${BITRIX_URL}user.get?ACTIVE=true`);
    const usersData = await usersRes.json();
    if (usersData.result) {
      const users = usersData.result.map(u => ({
        id: u.ID,
        name: u.NAME,
        last_name: u.LAST_NAME,
        email: u.EMAIL,
        active: u.ACTIVE
      }));
      await supabase.from('users').upsert(users, { onConflict: 'id' });
      results.users = users.length;
    }

    // Sync Sources
    const sourcesRes = await fetch(`${BITRIX_URL}crm.status.list?filter[ENTITY_ID]=SOURCE`);
    const sourcesData = await sourcesRes.json();
    if (sourcesData.result) {
      const sources = sourcesData.result.map(s => ({
        id: s.STATUS_ID,
        name: s.NAME
      }));
      await supabase.from('sources').upsert(sources, { onConflict: 'id' });
      results.sources = sources.length;
    }

    return Response.json({ success: true, results });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
