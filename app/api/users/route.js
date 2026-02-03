import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('active', true);

    if (error) throw error;

    const users = data.map(u => ({
      ID: u.id,
      NAME: u.name,
      LAST_NAME: u.last_name,
      EMAIL: u.email,
      ACTIVE: u.active
    }));

    return Response.json({ success: true, data: users, total: users.length });
  } catch (error) {
    console.error('Erreur users:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
