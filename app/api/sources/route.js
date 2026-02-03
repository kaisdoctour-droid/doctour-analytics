import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  try {
    const { data, error } = await supabase
      .from('sources')
      .select('*');

    if (error) throw error;

    const sources = {};
    data.forEach(s => {
      sources[s.id] = s.name;
    });

    return Response.json({ success: true, data: sources, total: data.length });
  } catch (error) {
    console.error('Erreur sources:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
