import { supabase } from '@/lib/supabase';
import { livePromotedIds, promotedFirst, type PromotionRow } from '@/lib/teacherPromotionsCore';

export { livePromotedIds, promotedFirst };
export type PromotionMode = 'online' | 'in_person';

/** Never throws: any failure (or a missing table) means nobody is promoted. */
export async function fetchPromotedTeacherIds(mode: PromotionMode): Promise<string[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('teacher_promotions')
      .select('teacher_id, starts_at, ends_at')
      .eq('mode', mode)
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .limit(10);
    if (error || !data) return [];
    return livePromotedIds(data as PromotionRow[], Date.now());
  } catch {
    return [];
  }
}
