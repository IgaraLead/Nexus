import { Badge, Button, Input } from '@igaralead/ui';
import { Download, Filter, MessageSquarePlus, MoreHorizontal, Search, Upload, UserPlus } from 'lucide-react';

import { DashboardContentFrame } from '../components/layout';
import { useContacts } from '../features/contacts/api';
import { useFilterStore } from '../stores/filter-store';

export const ContactsPage = () => {
  const contactSearch = useFilterStore(state => state.contactSearch);
  const setContactSearch = useFilterStore(state => state.setContactSearch);
  const { data: contacts = [] } = useContacts(contactSearch);

  return (
    <DashboardContentFrame>
    <section className="flex h-full w-full gap-4 overflow-hidden bg-background">
      <div className="flex h-full w-full flex-col transition-all duration-300">
        <header className="sticky top-0 z-10 border-b border-border bg-background px-6 py-6">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-xl font-semibold text-foreground">Contacts</h1>
                <p className="text-sm text-muted-foreground">Lista de contatos com busca, filtros e acoes do layout Vue.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm">
                  <Upload className="size-4" />
                  Import
                </Button>
                <Button type="button" variant="outline" size="sm">
                  <Download className="size-4" />
                  Export
                </Button>
                <Button type="button" size="sm">
                  <UserPlus className="size-4" />
                  New contact
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search contacts"
                  value={contactSearch}
                  onChange={event => setContactSearch(event.target.value)}
                />
              </div>
              <Button type="button" variant="secondary" size="sm">
                <Filter className="size-4" />
                Filters
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Mais acoes">
                <MoreHorizontal className="size-4" />
              </Button>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-6">
          <div className="mx-auto w-full max-w-5xl py-4">
            <div className="mb-3 rounded-xl border border-border bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
              Segmento ativo: todos os contatos com atividade recente. Use filtros para criar uma visualizacao salva.
            </div>

            <div className="grid gap-3">
              {contacts.map(contact => (
                <article key={contact.id} className="rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent/20">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                        {contact.name[0]}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{contact.name}</p>
                        <p className="truncate text-sm text-muted-foreground">{contact.email}</p>
                      </div>
                    </div>
                    <div className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
                      <span>{contact.phone}</span>
                      <span>{contact.company}</span>
                      <span className="font-mono text-xs">{contact.lastSeen}</span>
                    </div>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Enviar mensagem para ${contact.name}`}>
                      <MessageSquarePlus className="size-4" />
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </main>

        <footer className="sticky bottom-0 border-t border-border bg-card px-6 py-3">
          <div className="mx-auto flex max-w-5xl items-center justify-between text-sm text-muted-foreground">
            <span>Showing 1-{contacts.length} of {contacts.length}</span>
            <Badge variant="outline">Page 1</Badge>
          </div>
        </footer>
      </div>
    </section>
    </DashboardContentFrame>
  );
};
