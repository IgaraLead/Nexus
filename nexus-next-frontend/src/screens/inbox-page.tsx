import { Badge, Button } from '@igaralead/ui';
import { Bell, ChevronDown, Inbox, MoreHorizontal, Trash2 } from 'lucide-react';

import { DashboardContentFrame, SplitPaneLayout } from '../components/layout';
import { useNotificationActions, useNotifications } from '../features/inbox/api';

export const InboxPage = () => {
  const { data: notifications = [], isFetching } = useNotifications();
  const { markAllRead } = useNotificationActions();

  return (
    <DashboardContentFrame>
      <SplitPaneLayout
        list={
        <>
          <div className="flex h-[3.25rem] w-full items-center justify-between gap-1 pl-4 pr-3">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <h1 className="min-w-0 truncate text-sm font-semibold text-foreground">My Inbox</h1>
              <Button type="button" variant="secondary" size="sm" className="h-7 gap-1 px-2 text-xs">
                Display
                <ChevronDown className="size-3" />
              </Button>
            </div>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Opcoes da inbox">
              <MoreHorizontal className="size-4" />
            </Button>
          </div>

          <div className="flex h-[calc(100%-3.25rem)] w-full flex-col gap-0.5 divide-y divide-border overflow-x-hidden overflow-y-auto px-2 pb-4">
            {notifications.length ? (
              notifications.map(notification => (
                <button
                  key={notification.id}
                  type="button"
                  className="group flex w-full items-start gap-3 rounded-lg px-2 py-3 text-left transition-colors hover:bg-accent/40"
                >
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Bell className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">{notification.title}</span>
                      {notification.unread ? <span className="size-1.5 rounded-full bg-primary" /> : null}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{notification.description}</span>
                    <span className="mt-1 block truncate text-[11px] text-muted-foreground/80">{notification.meta}</span>
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">{notification.time}</span>
                </button>
              ))
            ) : (
              <div className="flex min-h-40 items-center justify-center px-4 text-center text-sm text-muted-foreground">
                {isFetching ? 'Loading notifications...' : 'No notifications'}
              </div>
            )}
          </div>
        </>
      }
      detail={
        <div className="flex h-full w-full items-center justify-center text-center">
          <div>
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Inbox className="size-5" />
            </div>
            <p className="text-sm font-medium text-foreground">Notifications from all subscribed inboxes</p>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Selecione uma notificacao na lista para abrir o detalhe neste painel.
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <Badge variant="outline">Inbox view</Badge>
              <Button type="button" variant="ghost" size="sm" onClick={() => markAllRead.mutate()}>
                <Trash2 className="size-4" />
                Limpar lidas
              </Button>
            </div>
          </div>
        </div>
      }
    />
    </DashboardContentFrame>
  );
};
