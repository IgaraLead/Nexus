import {
  Badge,
  Button,
  Card,
  CardContent,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@igaralead/ui';
import { CalendarDays, Download, LineChart } from 'lucide-react';

import { DocumentPageFrame, PageHeader } from '../components/layout';
import { useReportOverview } from '../features/reports/api';
import { useFilterStore } from '../stores/filter-store';

export const ReportsPage = () => {
  const reportRange = useFilterStore(state => state.reportRange);
  const setReportRange = useFilterStore(state => state.setReportRange);
  const { data } = useReportOverview(reportRange);
  const reportMetrics = data.metrics;
  const reportRows = data.rows;

  return (
    <DocumentPageFrame>
    <PageHeader
      title="Reports"
      description="Resumo operacional em wrapper centralizado, seguindo a estrutura de reports do Vue."
      actions={
        <Button type="button" variant="outline" size="sm">
          <Download className="size-4" />
          Export
        </Button>
      }
    />

    <div className="mt-5 flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <CalendarDays className="size-4 text-primary" />
        Report period
      </div>
      <div className="flex flex-wrap gap-2 sm:ml-auto">
        <Select value={reportRange} onValueChange={value => setReportRange(value as typeof reportRange)}>
          <SelectTrigger size="sm" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
        <Select defaultValue="all">
          <SelectTrigger size="sm" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All inboxes</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="website">Website</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>

    <section className="mt-6 grid gap-4 md:grid-cols-4">
      {reportMetrics.map(metric => (
        <Card key={metric.label}>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">{metric.label}</p>
            <div className="mt-3 flex items-end justify-between gap-3">
              <p className="text-2xl font-semibold text-foreground">{metric.value}</p>
              <Badge variant={metric.delta.startsWith('-') ? 'success' : 'outline'}>{metric.delta}</Badge>
            </div>
          </CardContent>
        </Card>
      ))}
    </section>

    <section className="mt-6 grid gap-4 md:grid-cols-2">
      {['Conversation volume', 'First response time'].map(title => (
        <Card key={title} className="overflow-hidden">
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-foreground">{title}</h2>
                <p className="text-sm text-muted-foreground">Not enough data for a full chart yet.</p>
              </div>
              <LineChart className="size-4 text-primary" />
            </div>
            <div className="flex h-72 items-center justify-center bg-muted/20">
              <div className="text-center">
                <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <LineChart className="size-4" />
                </div>
                <p className="text-sm text-muted-foreground">Chart area</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </section>

    <Card className="mt-6 overflow-hidden py-0">
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Queue</TableHead>
              <TableHead>Conversations</TableHead>
              <TableHead>Resolved</TableHead>
              <TableHead>Avg response</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reportRows.map(row => (
              <TableRow key={row.queue}>
                <TableCell className="font-medium">{row.queue}</TableCell>
                <TableCell>{row.conversations}</TableCell>
                <TableCell>{row.resolved}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{row.response}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
    </DocumentPageFrame>
  );
};
