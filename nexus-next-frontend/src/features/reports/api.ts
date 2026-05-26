import { useQuery } from '@tanstack/react-query';

import { apiRequest } from '../../api/client';
import { queryKeys } from '../../api/query-keys';
import { getCurrentAccountId } from '../../auth/session';
import { reportMetrics, reportRows } from '../../screens/mock-data';

export type ReportOverview = {
  metrics: typeof reportMetrics;
  rows: typeof reportRows;
};

const isLocalAccount = (accountId: string) => accountId === 'local-account';

export const reportsApi = {
  botSummary: () => apiRequest('/reports/bot_summary', { version: 'v2' }),
  csat: () => apiRequest('/csat_survey_responses'),
  liveConversationMetrics: () => apiRequest('/live_reports/conversation_metrics', { version: 'v2' }),
  overview: () => apiRequest<ReportOverview>('/reports', { version: 'v2' }),
  sla: () => apiRequest('/applied_slas'),
  summary: () => apiRequest('/reports/summary', { version: 'v2' }),
};

export const useReportOverview = (range: string) => {
  const accountId = getCurrentAccountId();

  return useQuery({
    enabled: !isLocalAccount(accountId),
    initialData: { metrics: reportMetrics, rows: reportRows } satisfies ReportOverview,
    queryFn: reportsApi.overview,
    queryKey: queryKeys.reports(accountId, { range }),
  });
};
