import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface VoiceDashboardRecord {
  id: string;
  contact_id: string;
  deal_id: string | null;
  agent_id: string | null;
  elevenlabs_conversation_id: string | null;
  status: string;
  qualification_result: string | null;
  interest_level: string | null;
  call_summary: string | null;
  observations: string | null;
  attempt_number: number;
  max_attempts: number;
  scheduled_for: string;
  called_at: string | null;
  completed_at: string | null;
  created_at: string;
  contacts: {
    name: string | null;
    phone_number: string;
  } | null;
}

export interface VoiceDashboardMetrics {
  records: VoiceDashboardRecord[];
  total: number;
  byStatus: Record<string, number>;
  completedCount: number;
  qualifiedCount: number;
  pendingCount: number;
  cancelledCount: number;
  failedCount: number;
  noAnswerCount: number;
  attendanceRate: number;
  qualificationRate: number;
  dailyData: { date: string; total: number; completed: number; qualified: number }[];
  recentFailures: VoiceDashboardRecord[];
}

function computeMetrics(records: VoiceDashboardRecord[]): VoiceDashboardMetrics {
  const byStatus: Record<string, number> = {};
  let completedCount = 0;
  let qualifiedCount = 0;
  let pendingCount = 0;
  let cancelledCount = 0;
  let failedCount = 0;
  let noAnswerCount = 0;

  records.forEach(r => {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    if (r.status === 'completed') {
      completedCount++;
      if (r.qualification_result?.toLowerCase().includes('qualificado') &&
          !r.qualification_result?.toLowerCase().includes('não')) {
        qualifiedCount++;
      }
    }
    if (['pending', 'scheduled'].includes(r.status)) pendingCount++;
    if (r.status === 'cancelled') cancelledCount++;
    if (['failed', 'not_contacted', 'call_initiation_failure'].includes(r.status)) failedCount++;
    if (r.status === 'no_answer') noAnswerCount++;
  });

  const attemptedCount = completedCount + noAnswerCount + failedCount;
  const attendanceRate = attemptedCount > 0 ? (completedCount / attemptedCount) * 100 : 0;
  const qualificationRate = completedCount > 0 ? (qualifiedCount / completedCount) * 100 : 0;

  // Daily aggregation
  const dailyMap: Record<string, { total: number; completed: number; qualified: number }> = {};
  records.forEach(r => {
    const date = new Date(r.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    if (!dailyMap[date]) dailyMap[date] = { total: 0, completed: 0, qualified: 0 };
    dailyMap[date].total++;
    if (r.status === 'completed') {
      dailyMap[date].completed++;
      if (r.qualification_result?.toLowerCase().includes('qualificado') &&
          !r.qualification_result?.toLowerCase().includes('não')) {
        dailyMap[date].qualified++;
      }
    }
  });

  const dailyData = Object.entries(dailyMap)
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => {
      const [dA, mA] = a.date.split('/').map(Number);
      const [dB, mB] = b.date.split('/').map(Number);
      return mA !== mB ? mA - mB : dA - dB;
    });

  const recentFailures = records
    .filter(r => ['failed', 'not_contacted', 'call_initiation_failure', 'no_answer'].includes(r.status))
    .slice(0, 10);

  return {
    records,
    total: records.length,
    byStatus,
    completedCount,
    qualifiedCount,
    pendingCount,
    cancelledCount,
    failedCount,
    noAnswerCount,
    attendanceRate,
    qualificationRate,
    dailyData,
    recentFailures,
  };
}

export function useVoiceDashboardMetrics() {
  return useQuery({
    queryKey: ['voice-dashboard-metrics'],
    queryFn: async (): Promise<VoiceDashboardMetrics> => {
      const { data, error } = await supabase
        .from('voice_qualifications')
        .select('id, contact_id, deal_id, agent_id, elevenlabs_conversation_id, status, qualification_result, interest_level, call_summary, observations, attempt_number, max_attempts, scheduled_for, called_at, completed_at, created_at, contacts(name, phone_number)')
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      return computeMetrics((data || []) as unknown as VoiceDashboardRecord[]);
    },
    staleTime: 30_000,
  });
}
