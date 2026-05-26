import { Badge, Button, Card, CardContent, Input } from '@igaralead/ui';
import { ArrowRight, Inbox, Plus, Search, Settings, Trash2 } from 'lucide-react';

import { DocumentPageFrame, PageHeader } from '../components/layout';
import { useInboxes } from '../features/channels/api';
import { channelTypes } from './mock-data';

export const ChannelsPage = () => {
  const { data: channels = [] } = useInboxes();

  return (
    <DocumentPageFrame>
    <PageHeader
      title="Inboxes"
      description="Gerencie canais conectados ao Nexus seguindo o layout de settings do frontend Vue."
      actions={
        <Button type="button" size="sm">
          <Plus className="size-4" />
          New inbox
        </Button>
      }
    />

    <section className="mt-6 rounded-xl border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Connected inboxes</h2>
          <p className="text-sm text-muted-foreground">{channels.length} of 12 slots in use</p>
        </div>
        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search inboxes" />
        </div>
      </div>

      <div className="divide-y divide-border">
        {channels.map(channel => (
          <div key={channel.id} className="flex items-center justify-between gap-4 px-4 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-primary/10 text-primary">
                <Inbox className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{channel.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {channel.type} · {channel.conversations} conversas
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={channel.status === 'ativo' ? 'success' : 'warning'}>{channel.status}</Badge>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Configurar ${channel.name}`}>
                <Settings className="size-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Excluir ${channel.name}`}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>

    <section className="mt-8">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-foreground">Create new channel</h2>
        <p className="text-sm text-muted-foreground">Grade equivalente ao fluxo de criacao de inboxes do Vue.</p>
      </div>
      <div className="grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
        {channelTypes.map(channel => (
          <Card key={channel.key} className="py-0 transition-colors hover:border-primary/40 hover:bg-primary/5">
            <CardContent className="p-5">
              <div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Inbox className="size-4" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">{channel.title}</h3>
              <p className="mt-2 min-h-10 text-sm leading-5 text-muted-foreground">{channel.description}</p>
              <Button type="button" variant="ghost" size="sm" className="mt-4 px-0">
                Configure
                <ArrowRight className="size-4" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
    </DocumentPageFrame>
  );
};
