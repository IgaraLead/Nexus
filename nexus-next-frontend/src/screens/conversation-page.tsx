import { Badge, Button, Tabs, TabsList, TabsTrigger, Textarea, cn } from '@igaralead/ui';
import { CheckCircle2, ChevronLeft, ListFilter, PanelRight, Search, Send, SlidersHorizontal } from 'lucide-react';

import { DashboardContentFrame, SplitPaneLayout } from '../components/layout';
import { useConversationActions, useConversationList, useConversationMessages } from '../features/conversations/api';
import { useUiStore } from '../stores/ui-store';

export const ConversationsPage = () => {
  const { data: conversations = [] } = useConversationList();
  const activeConversationId = useUiStore(state => state.activeConversationId);
  const setActiveConversationId = useUiStore(state => state.setActiveConversationId);
  const activeConversation = conversations.find(conversation => conversation.id === activeConversationId) ?? conversations[0];
  const { data: messages = [] } = useConversationMessages(activeConversation?.id ?? 'preview');
  const { resolve } = useConversationActions();

  if (!activeConversation) {
    return (
      <DashboardContentFrame>
        <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">No conversations</div>
      </DashboardContentFrame>
    );
  }

  return (
    <DashboardContentFrame>
    <SplitPaneLayout
      listClassName="lg:min-w-[340px] lg:max-w-[340px] 2xl:min-w-[412px] 2xl:max-w-[412px]"
      list={
        <>
          <div className="flex h-[3.25rem] items-center justify-between gap-2 border-b border-border px-3">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-base font-medium text-foreground">Conversations</h1>
              <span className="rounded-md bg-muted px-2 py-1 text-[10px] capitalize text-foreground">Open</span>
            </div>
            <div className="flex items-center gap-1">
              <Button type="button" variant="secondary" size="icon-sm" aria-label="Filtrar conversas">
                <ListFilter className="size-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Alternar layout">
                <PanelRight className="size-4" />
              </Button>
            </div>
          </div>

          <div className="border-b border-border px-2 py-2">
            <Tabs defaultValue="mine" className="gap-0">
              <TabsList className="grid h-8 w-full grid-cols-3 rounded-md">
                <TabsTrigger value="mine" className="text-xs">Mine 12</TabsTrigger>
                <TabsTrigger value="all" className="text-xs">All 48</TabsTrigger>
                <TabsTrigger value="unassigned" className="text-xs">Open 9</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs">
              <SlidersHorizontal className="size-3.5" />
              Basic filters
            </Button>
            <Button type="button" variant="ghost" size="sm" className="ml-auto h-8 text-xs">
              <Search className="size-3.5" />
              Search
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
            {conversations.map(conversation => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => setActiveConversationId(conversation.id)}
                className={cn(
                  'mt-1 flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors',
                  conversation.id === activeConversation.id ? 'bg-primary/10 text-foreground' : 'hover:bg-accent/40'
                )}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                  {conversation.name[0]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{conversation.name}</span>
                    {conversation.unread ? (
                      <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                        {conversation.unread}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{conversation.preview}</span>
                  <span className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{conversation.channel}</span>
                    <span className="size-1 rounded-full bg-muted-foreground/50" />
                    <span>{conversation.assignee}</span>
                  </span>
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">{conversation.time}</span>
              </button>
            ))}
          </div>
        </>
      }
      detail={
        <div className="flex h-full min-w-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex h-24 shrink-0 items-start justify-between gap-4 border-b border-border px-4 py-3 xl:h-12 xl:items-center xl:py-0">
              <div className="flex min-w-0 items-center gap-3">
                <Button type="button" variant="ghost" size="icon-sm" className="xl:hidden" aria-label="Voltar para lista">
                  <ChevronLeft className="size-4" />
                </Button>
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-foreground">{activeConversation.name}</h2>
                  <p className="truncate text-xs text-muted-foreground">
                    #{activeConversation.id} · {activeConversation.channel} · conversa aberta
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="success">online</Badge>
                <Button type="button" variant="secondary" size="sm" onClick={() => resolve.mutate(activeConversation.id)}>
                  <CheckCircle2 className="size-4" />
                  Resolve
                </Button>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <div className="mx-auto flex max-w-3xl flex-col gap-4">
                {messages.map(message => (
                  <div
                    key={message.id}
                    className={cn('flex flex-col', message.direction === 'outgoing' ? 'items-end' : 'items-start')}
                  >
                    <div
                      className={cn(
                        'max-w-[72%] rounded-2xl px-4 py-3 text-sm shadow-sm',
                        message.direction === 'outgoing'
                          ? 'rounded-tr-sm bg-primary text-primary-foreground'
                          : 'rounded-tl-sm bg-muted text-foreground'
                      )}
                    >
                      {message.body}
                    </div>
                    <span className="mt-1 font-mono text-[10px] text-muted-foreground">
                      {message.author} · {message.time}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <footer className="border-t border-border p-4">
              <div className="mx-auto max-w-3xl rounded-xl border border-border bg-card p-3">
                <Textarea placeholder="Reply to Joana Lima..." className="min-h-20 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0" />
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Adapters de mensagem e anexos entram na proxima fase.</span>
                  <Button type="button" size="sm">
                    <Send className="size-4" />
                    Send
                  </Button>
                </div>
              </div>
            </footer>
          </div>

          <aside className="hidden h-full w-[320px] shrink-0 border-l border-border bg-card/60 p-4 2xl:block">
            <p className="text-sm font-semibold text-foreground">Contact</p>
            <div className="mt-4 rounded-xl border border-border bg-background p-4">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">J</span>
                <div>
                  <p className="text-sm font-medium text-foreground">Joana Lima</p>
                  <p className="text-xs text-muted-foreground">joana@example.com</p>
                </div>
              </div>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Company</span>
                  <span className="text-foreground">Acme</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Priority</span>
                  <span className="text-foreground">{activeConversation.priority}</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      }
    />
    </DashboardContentFrame>
  );
};
